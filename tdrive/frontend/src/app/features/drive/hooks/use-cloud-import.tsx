import { useCallback, useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { DriveApiClient } from '../api-client/api-client';
import { useDriveActions } from './use-drive-actions';
import { useCurrentUser } from 'app/features/users/hooks/use-current-user';
import useRouterCompany from '@features/router/hooks/use-router-company';
import { ToasterService } from '@features/global/services/toaster-service';
import Logger from '@features/global/framework/logger-service';
import FileUploadService from '@features/files/services/file-upload-service';
import JWTStorage from '@features/auth/jwt-storage-service';
import { SyncProgressAtom } from '../state/sync-progress';

const logger = Logger.getLogger('CloudImportHook');

export interface CloudImportOptions {
  targetFolderId?: string;
  overwrite?: boolean;
}

/**
 * Hook pour importer les fichiers Dropbox ou Google Drive vers le disque local
 */
export const useCloudImport = () => {
  const { user } = useCurrentUser();
  const company = useRouterCompany();
  const { refresh } = useDriveActions();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [syncProgress, setSyncProgress] = useRecoilState(SyncProgressAtom);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Utiliser des chemins relatifs pour passer par Nginx (/api)
  const backendUrl = '';
  const authHeader = JWTStorage.getAutorizationHeader();

  /**
   * Récupérer la liste des items (fichiers + dossiers) depuis Dropbox
   */
  const getDropboxFiles = useCallback(async (path: string = ''): Promise<any[]> => {
    if (!user?.email) throw new Error('Utilisateur non connecté');
    const res = await fetch(
      `${backendUrl}/api/v1/files/rclone/list?path=${encodeURIComponent(path)}&userEmail=${encodeURIComponent(user.email)}`,
      {
        method: 'GET',
        headers: { 'Authorization': authHeader }
      }
    );
    if (!res.ok) throw new Error(`Erreur liste Dropbox: ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Réponse API invalide');
    return data;
  }, [user?.email]);

  /**
   * Récupérer **tous** les fichiers (pas les dossiers) sous un path, récursivement
   */
  const getAllDropboxFiles = useCallback(async (rootPath: string = ''): Promise<Array<{ path: string; name: string }>> => {
    const stack = [rootPath];
    const allFiles: Array<{ path: string; name: string }> = [];

    while (stack.length) {
      const current = stack.pop()!;
      const items = await getDropboxFiles(current);

      for (const item of items) {
        // génère le chemin complet : soit "dossier/fichier", soit juste "fichier" en racine
        const fullPath = current ? `${current}/${item.path}` : item.path;
        if (item.is_directory) {
          stack.push(fullPath);
        } else {
          allFiles.push({ path: fullPath, name: item.name });
        }
      }
      
    }

    return allFiles;
  }, [getDropboxFiles]);

  /**
   * Importe un seul fichier depuis Dropbox vers le disque local
   */
  const importDropboxFile = useCallback(async (
    dropboxPath: string,
    fileName: string,
    targetFolderId: string
  ): Promise<void> => {
    logger.info('Import du fichier Dropbox:', dropboxPath);

    // 1. Télécharger depuis Dropbox
    const safePath = dropboxPath
  .split('/')
  .map(segment => encodeURIComponent(segment))
  .join('/');
const downloadUrl = `${backendUrl}/api/v1/files/rclone/download?path=${safePath}&userEmail=${encodeURIComponent(user!.email)}`;

    const resp = await fetch(downloadUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader }
    });
    if (!resp.ok) throw new Error(`Téléchargement failed: ${resp.statusText}`);
    const blob = await resp.blob();

    // 2. Ajuster le mime si nécessaire
    let mimeType = blob.type;
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = fileName.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'png': mimeType = 'image/png'; break;
        case 'jpg': case 'jpeg': mimeType = 'image/jpeg'; break;
        case 'gif': mimeType = 'image/gif'; break;
        case 'pdf': mimeType = 'application/pdf'; break;
        case 'txt': mimeType = 'text/plain'; break;
        case 'doc': mimeType = 'application/msword'; break;
        case 'docx': mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
        default: mimeType = 'application/octet-stream';
      }
    }

    // 3. Créer File et uploader via FileUploadService
    const file = new File([blob], fileName, { type: mimeType });
    await new Promise<void>((resolve, reject) => {
      FileUploadService.resetStates([file.name]);
      FileUploadService.upload([{ root: file.name, file }], {
        context: { companyId: company, parentId: targetFolderId },
        callback: async (filePayload, context) => {
          try {
            const uploaded = filePayload.file;
            if (!uploaded) throw new Error('Échec de l’upload');
            // créer l’entrée Drive
            await DriveApiClient.create(context.companyId, {
              item: {
                company_id: context.companyId,
                workspace_id: 'drive',
                parent_id: context.parentId,
                name: uploaded.metadata?.name,
                size: uploaded.upload_data?.size
              },
              version: {
                provider: 'internal',
                application_id: '',
                file_metadata: {
                  name: uploaded.metadata?.name,
                  size: uploaded.upload_data?.size,
                  mime: uploaded.metadata?.mime,
                  thumbnails: uploaded.thumbnails,
                  source: 'internal',
                  external_id: uploaded.id
                }
              }
            });
            logger.info('Fichier importé:', fileName);
            resolve();
          } catch (e) {
            logger.error('Erreur création item Drive:', e);
            reject(e);
          }
        }
      });
    });
  }, [backendUrl, authHeader, company, user?.email]);

  /**
   * Crée tous les dossiers nécessaires en une seule passe
   */
  const createAllRequiredFolders = useCallback(async (
    files: Array<{ path: string; name: string }>,
    folderMap: Map<string, string>,
    targetFolderId: string
  ) => {
    // Extraire tous les chemins de dossiers uniques
    const folderPaths = new Set<string>();
    files.forEach(({ path }) => {
      const segments = path.split('/');
      for (let i = 0; i < segments.length - 1; i++) {
        const folderPath = segments.slice(0, i + 1).join('/');
        folderPaths.add(folderPath);
      }
    });

    // Trier par profondeur pour créer les dossiers parents en premier
    const sortedPaths = Array.from(folderPaths).sort((a, b) => {
      return a.split('/').length - b.split('/').length;
    });

    // Créer les dossiers séquentiellement
    for (const folderPath of sortedPaths) {
      if (!folderMap.has(folderPath)) {
        const segments = folderPath.split('/');
        const parentPath = segments.slice(0, -1).join('/');
        const folderName = segments[segments.length - 1];
        const parentId = folderMap.get(parentPath) || targetFolderId;

        try {
          const folderItem = await DriveApiClient.create(company, {
            item: {
              company_id: company,
              workspace_id: 'drive',
              parent_id: parentId,
              name: folderName,
              is_directory: true
            }
          });
          folderMap.set(folderPath, folderItem.id);
          logger.debug(`📁 Created folder: ${folderPath}`);
        } catch (error) {
          logger.error(`❌ Failed to create folder ${folderPath}:`, error);
          throw error;
        }
      }
    }
  }, [company]);

  /**
   * Obtient l'ID du dossier parent pour un fichier donné
   */
  const getParentIdForFile = useCallback((
    filePath: string,
    folderMap: Map<string, string>,
    targetFolderId: string
  ): string => {
    const segments = filePath.split('/');
    if (segments.length === 1) {
      return targetFolderId; // Fichier à la racine
    }
    const parentPath = segments.slice(0, -1).join('/');
    return folderMap.get(parentPath) || targetFolderId;
  }, []);

  /**
   * Importe un fichier avec retry automatique en cas d'échec
   */
  const importDropboxFileWithRetry = useCallback(async (
    dropboxPath: string,
    fileName: string,
    targetFolderId: string,
    maxRetries: number = 2
  ): Promise<void> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        await importDropboxFile(dropboxPath, fileName, targetFolderId);
        return; // Succès
      } catch (error) {
        lastError = error as Error;
        logger.warn(`⚠️ Attempt ${attempt}/${maxRetries + 1} failed for ${fileName}:`, error);
        
        if (attempt <= maxRetries) {
          // Attendre avant de réessayer (backoff exponentiel)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Si on arrive ici, tous les essais ont échoué
    throw lastError || new Error(`Failed to import ${fileName} after ${maxRetries + 1} attempts`);
  }, [importDropboxFile]);

  /**
   * Synchronise un dossier entier depuis Dropbox ou Google Drive vers Twake Drive en 2 phases
   * Phase 1: Analyse de l'arborescence et création des dossiers
   * Phase 2: Synchronisation des fichiers
   */
  const importDropboxFolder = useCallback(async (
    dropboxPath: string,
    targetFolderId: string,
    options: { provider?: 'dropbox' | 'googledrive' } = {}
  ): Promise<void> => {
    const provider = options.provider || 'dropbox';
    if (!user?.email) {
      throw new Error('Utilisateur non connecté');
    }

    if (importing) {
      ToasterService.info('Une synchronisation est déjà en cours');
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setImporting(true);
    setImportProgress({ current: 0, total: 0, currentFile: 'Initialisation de la synchronisation...' });
    setSyncProgress({ active: true, provider, current: 0, total: 0, currentFile: 'Initialisation...', cancelled: false });

    try {
      logger.info(`🚀 Starting 2-phase ${provider.toUpperCase()} sync from ${dropboxPath} to ${targetFolderId}`);
      console.log(`🔑 driveParentId envoyé au backend: "${targetFolderId}"`);
      
      // === PHASE 1: Analyse de l'arborescence ===
      const updateProgress = (current: number, total: number, currentFile: string) => {
        setImportProgress({ current, total, currentFile });
        setSyncProgress(prev => prev.cancelled ? prev : { ...prev, current, total, currentFile });
      };

      updateProgress(0, 0, `Analyse de l'arborescence ${provider.toUpperCase()}...`);
      
      const analyzeResponse = await fetch(`${backendUrl}/api/v1/rclone/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        signal: abortController.signal,
        body: JSON.stringify({
          path: dropboxPath,
          userEmail: user.email,
          driveParentId: targetFolderId,
          provider: provider,
          userId: user.id,
          companyId: company
        })
      });
      
      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({ message: analyzeResponse.statusText }));
        throw new Error(`Erreur d'analyse: ${errorData.message}`);
      }
      
      const analyzeData = await analyzeResponse.json();
      const foldersToCreate: string[] = analyzeData.folders || [];
      const totalFiles: number = analyzeData.totalFiles || 0;
      
      logger.info(`📁 Found ${foldersToCreate.length} folders to create and ${totalFiles} files to sync`);
      
      // === AFFICHAGE DES DONNÉES DE DIAGNOSTIC (AVANT SYNCHRONISATION) ===
      if (analyzeData.diagnostic) {
        const { dropbox, myDrive } = analyzeData.diagnostic;
        
        console.log(`\n📊 === DIAGNOSTIC ${provider.toUpperCase()} vs MyDrive (AVANT SYNC) ===`);
        
        console.log(`\n📁 ${provider.toUpperCase()} FOLDERS (premier niveau):`);
        dropbox.folders.forEach((folder: any) => {
          console.log(`  📁 ${folder.name} - ${folder.sizeKB} KB`);
        });
        
        console.log(`\n📄 ${provider.toUpperCase()} FILES (racine): ${dropbox.files.length} | Total récursif: ${dropbox.totalRecursiveFiles || totalFiles}`);
        dropbox.files.forEach((file: any) => {
          console.log(`  📄 ${file.name} - ${file.sizeKB} KB`);
        });
        
        console.log('\n🗂️ MYDRIVE FOLDERS:');
        myDrive.folders.forEach((folder: any) => {
          console.log(`  📁 ${folder.name} - ${folder.sizeKB} KB`);
        });
        
        console.log('\n📄 MYDRIVE FILES (racine uniquement):');
        myDrive.files.forEach((file: any) => {
          console.log(`  📄 ${file.name} - ${file.sizeKB} KB`);
        });
        
        console.log('\n📊 SUMMARY:');
        console.log(`  ${provider.toUpperCase()}: ${dropbox.totalRecursiveFiles || totalFiles} fichiers total (${dropbox.files.length} racine), ${dropbox.folders.length} dossiers`);
        console.log(`  MyDrive (dossier sync): ${myDrive.files.length} fichiers racine, ${myDrive.folders.length} dossiers`);
        
        // Afficher les éléments à synchroniser
        if (analyzeData.diagnostic.toSync) {
          const { toSync } = analyzeData.diagnostic;
          console.log('\n🔄 ÉLÉMENTS À SYNCHRONISER:');
          console.log(`  📁 Dossiers à sync: ${toSync.folders.length}/${dropbox.folders.length}`);
          toSync.folders.forEach((folder: any) => {
            console.log(`    ✅ ${folder.name} - ${folder.sizeKB} KB`);
          });
          console.log(`  📄 Fichiers racine à sync: ${toSync.files.length}/${dropbox.files.length}`);
          toSync.files.forEach((file: any) => {
            console.log(`    ✅ ${file.name} - ${file.sizeKB} KB`);
          });
          console.log(`  📄 Total fichiers à sync (racine + dossiers): ${toSync.totalFilesToSync || 'N/A'}`);
          
          if (toSync.folders.length === 0 && toSync.files.length === 0) {
            console.log('  ℹ️ Aucun élément à synchroniser (tout est à jour)');
          }
        }
        
        console.log('\n=== FIN DIAGNOSTIC (AVANT SYNC) ===\n');
        
        // Afficher aussi dans un toast pour l'utilisateur
        const syncFilesCount = analyzeData.diagnostic.toSync?.totalFilesToSync || 0;
        const syncFoldersCount = analyzeData.diagnostic.toSync?.folders?.length || 0;
        const syncCount = syncFoldersCount + syncFilesCount;
        ToasterService.info(`📊 Diagnostic: ${syncFoldersCount} dossiers + ${syncFilesCount} fichiers à synchroniser`);
        
        // Si rien à synchroniser, arrêter ici
        if (syncCount === 0) {
          console.log('ℹ️ Aucun élément à synchroniser - arrêt du processus');
          setImportProgress(null);
          setImporting(false);
          setSyncProgress({ active: false, provider: '', current: 0, total: 0, currentFile: '', cancelled: false });
          ToasterService.success('✅ Synchronisation terminée - tout est à jour');
          return;
        }
      }
      
      // === PHASE 2: Création des dossiers (seulement ceux à synchroniser) ===
      
      // Filtrer les dossiers à créer selon le diagnostic conditionnel
      const foldersToSync = analyzeData.diagnostic?.toSync?.folders || [];
      const foldersToSyncPaths = foldersToSync.map((f: any) => f.path || f.name);
      const filteredFoldersToCreate = foldersToCreate.filter((folderPath: string) => {
        // Créer le dossier si lui-même ou un de ses parents est à synchroniser
        return foldersToSyncPaths.some((syncPath: string) => 
          syncPath.startsWith(folderPath) || folderPath.startsWith(syncPath)
        );
      });
      
      console.log(`📁 Dossiers à créer filtrés: ${filteredFoldersToCreate.length}/${foldersToCreate.length}`);
      filteredFoldersToCreate.forEach(path => console.log(`  📁 ${path}`));
      
      // Utiliser le nombre réel de fichiers à synchroniser si disponible
      const realFilesToSync = analyzeData.diagnostic?.toSync?.totalFilesToSync || totalFiles;
      const totalElements = filteredFoldersToCreate.length + realFilesToSync;
      updateProgress(0, totalElements, 'Création des dossiers...');
      
      const folderMap: Record<string, string> = {};
      
      // Créer seulement les dossiers filtrés
      for (let i = 0; i < filteredFoldersToCreate.length; i++) {
        const folderPath = filteredFoldersToCreate[i];
        // Check cancellation
        if (abortController.signal.aborted) throw new DOMException('Synchronisation annulée', 'AbortError');
        updateProgress(i + 1, totalElements, `Création du dossier: ${folderPath}`);
        
        try {
          // Déterminer le dossier parent
          const pathSegments = folderPath.split('/');
          const folderName = pathSegments[pathSegments.length - 1];
          const parentPath = pathSegments.slice(0, -1).join('/');
          const parentId = parentPath && folderMap[parentPath] ? folderMap[parentPath] : targetFolderId;
          
          logger.debug(`📁 Creating folder: ${folderName} in parent ${parentId}`);
          
          // Créer le dossier via l'API standard Twake Drive
          const folderItem = await DriveApiClient.create(company, {
            item: {
              company_id: company,
              workspace_id: 'drive',
              parent_id: parentId,
              name: folderName,
              is_directory: true
            }
          });
          
          folderMap[folderPath] = folderItem.id;
          logger.debug(`✅ Created folder: ${folderPath} -> ${folderItem.id}`);
          
        } catch (error) {
          logger.error(`❌ Failed to create folder ${folderPath}:`, error);
          // Continuer même si un dossier échoue
        }
      }
      
      // === PHASE 3: Synchronisation des fichiers ===
      if (abortController.signal.aborted) throw new DOMException('Synchronisation annulée', 'AbortError');
      updateProgress(filteredFoldersToCreate.length, totalElements, 'Synchronisation des fichiers...');
      
      logger.info(`📁 Folder map created:`, folderMap);
      
      // Appel au backend pour synchroniser les fichiers avec la map des dossiers
      const syncResponse = await fetch(`${backendUrl}/api/v1/rclone/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        signal: abortController.signal,
        body: JSON.stringify({
          path: dropboxPath,
          userEmail: user.email,
          driveParentId: targetFolderId,
          folderMap: folderMap,
          provider: provider,
          userId: user.id,
          companyId: company
        })
      });
      
      if (!syncResponse.ok) {
        const errorData = await syncResponse.json().catch(() => ({ message: syncResponse.statusText }));
        throw new Error(`Erreur de synchronisation: ${errorData.message || syncResponse.statusText}`);
      }
      
      const syncResult = await syncResponse.json();
      
      logger.info('✅ 2-phase sync completed:', syncResult);
      
      // Mettre à jour le progrès final
      updateProgress(totalElements, totalElements, 'Synchronisation terminée !');
      
      // Rafraîchir l'affichage
      await refresh(targetFolderId);
      
      // Afficher le résultat
      const totalCreated = foldersToCreate.length;
      const filesProcessed = syncResult.filesProcessed || 0;
      
      if (syncResult.success) {
        ToasterService.success(`✅ Synchronisation terminée ! ${totalCreated} dossiers créés, ${filesProcessed} fichiers traités.`);
      } else {
        ToasterService.warning(`⚠️ Synchronisation terminée avec des avertissements: ${syncResult.message}`);
      }
      
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.info('🛑 Sync cancelled by user');
        ToasterService.info('Synchronisation annulée');
      } else {
        logger.error('❌ Sync failed:', error);
        ToasterService.error(`Erreur lors de la synchronisation: ${(error as Error).message}`);
      }
    } finally {
      setImporting(false);
      setImportProgress(null);
      setSyncProgress({ active: false, provider: '', current: 0, total: 0, currentFile: '', cancelled: false });
      abortControllerRef.current = null;
    }
  }, [user, importing, backendUrl, authHeader, refresh, setSyncProgress]);
  

  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setSyncProgress(prev => ({ ...prev, cancelled: true, currentFile: 'Annulation en cours...' }));
    }
  }, [setSyncProgress]);

  return {
    importing,
    importProgress,
    importDropboxFolder,
    cancelSync,
    syncProgress,
  };
};
