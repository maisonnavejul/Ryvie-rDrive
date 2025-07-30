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
   * Importe **tous** les fichiers (flatten) d’un dossier Dropbox
   */
  const importDropboxFolder = useCallback(async (
    dropboxPath: string = '',
    options: DropboxImportOptions = {}
  ) => {
    const targetFolderId = options.targetFolderId || `user_${user!.id}`;
    setImporting(true);
  
    try {
      // 1) récupérer récursivement tous les fichiers
      const files = await getAllDropboxFiles(dropboxPath);
  
      // 2) log de la liste complète
      console.log('📥 Tous les fichiers à importer :', files.map(f => f.name));
      if (files.length === 0) {
        ToasterService.info('Aucun fichier à importer');
        return;
      }
  
      // 3) prépare un cache des dossiers déjà créés
      const folderMap = new Map<string,string>();
      // la racine ("") correspond à targetFolderId
      folderMap.set('', targetFolderId);
  
      let importedCount = 0;
  
      // 4) pour chaque fichier, on s’assure que son chemin de dossiers existe
      for (const { path, name } of files) {
        // découpe « sous1/sous2/fichier.ext » → ['sous1','sous2','fichier.ext']
        const segments = path.split('/');
        let parentId = targetFolderId;
        let cumulativePath = '';
  
        // on ne prend que les segments de dossiers, sauf le dernier (le fichier)
        for (let i = 0; i < segments.length - 1; i++) {
          const seg = segments[i];
          cumulativePath = cumulativePath
            ? `${cumulativePath}/${seg}`
            : seg;
  
          // si ce dossier n’est pas encore créé
          if (!folderMap.has(cumulativePath)) {
            // créer le dossier
            const folderItem = await DriveApiClient.create(company, {
              item: {
                company_id: company,
                workspace_id: 'drive',
                parent_id: parentId,
                name: seg,
                is_directory: true
              }
            });
            // mémoriser son id
            folderMap.set(cumulativePath, folderItem.id);
          }
          parentId = folderMap.get(cumulativePath)!;
        }
  
        // 5) importer le fichier dans parentId
        setImportProgress({ current: importedCount, total: files.length, currentFile: name });
        try {
          await importDropboxFile(path, name, parentId);
          importedCount++;
        } catch (e) {
          logger.error(`Erreur import ${name}:`, e);
          ToasterService.error(`Échec import ${name}: ${(e as Error).message}`);
        }
      }
  
      // 6) feedback final
      ToasterService.success(`${importedCount}/${files.length} fichier(s) importé(s)`);
      await refresh(targetFolderId);
  
    } catch (err) {
      logger.error('Erreur import dossier:', err);
      ToasterService.error(`Erreur import: ${(err as Error).message}`);
    } finally {
      setImportProgress(null);
      setImporting(false);
    }
  }, [getAllDropboxFiles, importDropboxFile, refresh, user?.id]);
  

  return {
    importing,
    importProgress,
    getDropboxFiles,
    importDropboxFolder
  };
};
