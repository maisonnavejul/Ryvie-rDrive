import { useCallback, useState } from 'react';
import { DriveApiClient } from '../api-client/api-client';
import { useDriveActions } from './use-drive-actions';
import { useCurrentUser } from 'app/features/users/hooks/use-current-user';
import useRouterCompany from '@features/router/hooks/use-router-company';
import { ToasterService } from '@features/global/services/toaster-service';
import Logger from '@features/global/framework/logger-service';
import FileUploadService from '@features/files/services/file-upload-service';
import JWTStorage from '@features/auth/jwt-storage-service';

const logger = Logger.getLogger('DropboxImportHook');

export interface DropboxImportOptions {
  targetFolderId?: string;
  overwrite?: boolean;
}

/**
 * Hook pour importer les fichiers Dropbox vers le disque local
 */
export const useDropboxImport = () => {
  const { user } = useCurrentUser();
  const company = useRouterCompany();
  const { refresh } = useDriveActions();
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);

  const backendUrl = `${window.location.protocol}//${window.location.hostname}:4000`;
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
   * Importe **tous** les fichiers (flatten) d'un dossier Dropbox - VERSION OPTIMISÉE
   * Avec parallélisation contrôlée et gestion d'erreurs améliorée
   */
  const importDropboxFolder = useCallback(async (
    dropboxPath: string = '',
    options: DropboxImportOptions = {}
  ) => {
    const targetFolderId = options.targetFolderId || `user_${user!.id}`;
    setImporting(true);
    
    const startTime = Date.now();
  
    try {
      // 1) Récupérer récursivement tous les fichiers
      const files = await getAllDropboxFiles(dropboxPath);
  
      logger.info(`📥 Found ${files.length} files to import`);
      if (files.length === 0) {
        ToasterService.info('Aucun fichier à importer');
        return;
      }
  
      // 2) Préparer le cache des dossiers et créer tous les dossiers nécessaires en premier
      const folderMap = new Map<string, string>();
      folderMap.set('', targetFolderId);
      
      await createAllRequiredFolders(files, folderMap, targetFolderId);
      
      // 3) Traitement parallélisé des fichiers par lots
      const batchSize = 8; // Taille optimale pour éviter la surcharge
      let importedCount = 0;
      let errorCount = 0;
      const errors: Array<{file: string, error: string}> = [];
      
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(files.length / batchSize);
        
        logger.info(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`);
        
        // Mise à jour du progrès pour le lot
        setImportProgress({ 
          current: importedCount, 
          total: files.length, 
          currentFile: `Lot ${batchNumber}/${totalBatches} (${batch.length} fichiers)` 
        });
        
        // Traitement parallèle du lot avec gestion d'erreurs
        const batchResults = await Promise.allSettled(
          batch.map(async ({ path, name }) => {
            const parentId = getParentIdForFile(path, folderMap, targetFolderId);
            return await importDropboxFileWithRetry(path, name, parentId);
          })
        );
        
        // Compter les résultats du lot
        batchResults.forEach((result, index) => {
          const fileName = batch[index].name;
          if (result.status === 'fulfilled') {
            importedCount++;
            logger.debug(`✅ ${fileName} imported successfully`);
          } else {
            errorCount++;
            const errorMsg = result.reason?.message || 'Erreur inconnue';
            errors.push({ file: fileName, error: errorMsg });
            logger.error(`❌ Failed to import ${fileName}:`, result.reason);
          }
        });
        
        // Progression mise à jour
        const progress = Math.min(100, Math.round((importedCount + errorCount) / files.length * 100));
        logger.info(`📊 Progress: ${progress}% (${importedCount + errorCount}/${files.length})`);
        
        // Petite pause entre les lots pour éviter la surcharge
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // 4) Feedback final avec statistiques détaillées
      const duration = Math.round((Date.now() - startTime) / 1000);
      const successRate = Math.round((importedCount / files.length) * 100);
      
      if (errorCount === 0) {
        ToasterService.success(`🎉 ${importedCount} fichiers importés avec succès en ${duration}s (${successRate}%)`);
      } else {
        ToasterService.warning(`⚠️ ${importedCount}/${files.length} fichiers importés (${errorCount} erreurs)`);
        
        // Afficher les premières erreurs pour debug
        if (errors.length > 0) {
          const firstErrors = errors.slice(0, 3).map(e => `${e.file}: ${e.error}`).join('\n');
          logger.error('Premières erreurs d\'import:', firstErrors);
        }
      }
      
      await refresh(targetFolderId);
      
      logger.info(`🏁 Sync completed: ${importedCount} success, ${errorCount} errors, ${duration}s total`);
  
    } catch (err) {
      logger.error('Erreur critique import dossier:', err);
      ToasterService.error(`Erreur critique: ${(err as Error).message}`);
    } finally {
      setImportProgress(null);
      setImporting(false);
    }
  }, [getAllDropboxFiles, createAllRequiredFolders, getParentIdForFile, importDropboxFileWithRetry, refresh, user?.id]);
  

  return {
    importing,
    importProgress,
    getDropboxFiles,
    importDropboxFolder
  };
};
