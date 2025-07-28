import { useCallback, useState } from 'react';
import { useRecoilCallback } from 'recoil';
import { DriveApiClient } from '../api-client/api-client';
import { useDriveActions } from './use-drive-actions';
import { useCurrentUser } from 'app/features/users/hooks/use-current-user';
import useRouterCompany from '@features/router/hooks/use-router-company';
import { ToasterService } from '@features/global/services/toaster-service';
import Languages from 'features/global/services/languages-service';
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

  /**
   * Récupérer la liste des fichiers Dropbox
   */
  const getDropboxFiles = useCallback(async (path: string = ''): Promise<any[]> => {
    if (!user?.email) {
      throw new Error('Utilisateur non connecté');
    }

    const backendUrl = window.location.protocol + '//' + window.location.hostname + ':4000';
    const response = await fetch(
      `${backendUrl}/api/v1/files/rclone/list?path=${encodeURIComponent(path)}&userEmail=${encodeURIComponent(user.email)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': JWTStorage.getAutorizationHeader()
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Erreur lors de la récupération des fichiers Dropbox: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Format de réponse invalide de l\'API rclone');
    }

    logger.info('Fichiers Dropbox récupérés:', data);
    return data;
  }, [user?.email]);

  /**
   * Importer un fichier Dropbox vers le disque local
   */
  const importDropboxFile = useCallback(async (
    dropboxPath: string,
    fileName: string,
    targetFolderId: string = 'user_' + user?.id
  ): Promise<void> => {
    if (!user?.email) {
      throw new Error('Utilisateur non connecté');
    }

    logger.info('Import du fichier Dropbox:', { dropboxPath, fileName, targetFolderId });

    const backendUrl = window.location.protocol + '//' + window.location.hostname + ':4000';
    const downloadUrl = `${backendUrl}/api/v1/files/rclone/download?path=${encodeURIComponent(dropboxPath)}&userEmail=${encodeURIComponent(user.email)}`;
    
    logger.info('URL de téléchargement:', downloadUrl);
    
    // Étape 1: Télécharger le fichier depuis Dropbox
    const downloadResponse = await fetch(
      downloadUrl,
      {
        method: 'GET',
        headers: {
          'Authorization': JWTStorage.getAutorizationHeader()
        },
      }
    );

    if (!downloadResponse.ok) {
      throw new Error(`Erreur lors du téléchargement: ${downloadResponse.statusText}`);
    }

    const fileBlob = await downloadResponse.blob();
    
    // Déterminer le type MIME basé sur l'extension si le blob n'en a pas
    let mimeType = fileBlob.type;
    if (!mimeType || mimeType === 'application/octet-stream') {
      const extension = fileName.split('.').pop()?.toLowerCase();
      switch (extension) {
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
    
    logger.info('Fichier téléchargé - taille:', fileBlob.size, 'type original:', fileBlob.type, 'type final:', mimeType);
    
    // Étape 2: Créer un objet File
    const file = new File([fileBlob], fileName, { type: mimeType });

    // Étape 3: Uploader le fichier vers le disque local via FileUploadService
    return new Promise((resolve, reject) => {
      FileUploadService.resetStates([file.name]);
      FileUploadService.upload([{ root: file.name, file }], {
        context: {
          companyId: company,
          parentId: targetFolderId,
        },
        callback: async (filePayload, context) => {
          try {
            const uploadedFile = filePayload.file;
            if (uploadedFile) {
              // Créer l'item dans le drive
              await DriveApiClient.create(context.companyId, {
                item: {
                  company_id: context.companyId,
                  workspace_id: 'drive',
                  parent_id: context.parentId,
                  name: uploadedFile.metadata?.name,
                  size: uploadedFile.upload_data?.size,
                },
                version: {
                  provider: 'internal',
                  application_id: '',
                  file_metadata: {
                    name: uploadedFile.metadata?.name,
                    size: uploadedFile.upload_data?.size,
                    mime: uploadedFile.metadata?.mime,
                    thumbnails: uploadedFile?.thumbnails,
                    source: 'internal',
                    external_id: uploadedFile.id,
                  },
                },
              });
              logger.info('Fichier importé avec succès:', fileName);
              resolve();
            } else {
              reject(new Error('Échec de l\'upload du fichier'));
            }
          } catch (error) {
            logger.error('Erreur lors de la création de l\'item:', error);
            reject(error);
          }
        },
      });
    });
  }, [user?.email, user?.id, company]);

  /**
   * Importer plusieurs fichiers Dropbox
   */
  const importDropboxFiles = useCallback(async (
    files: Array<{ path: string; name: string; is_directory: boolean }>,
    options: DropboxImportOptions = {}
  ): Promise<void> => {
    const { targetFolderId = 'user_' + user?.id } = options;
    
    setImporting(true);
    setImportProgress({ current: 0, total: files.length, currentFile: '' });

    try {
      let imported = 0;
      
      for (const file of files) {
        if (file.is_directory) {
          // Ignorer les dossiers pour le moment
          continue;
        }

        setImportProgress({ 
          current: imported, 
          total: files.length, 
          currentFile: file.name 
        });

        try {
          await importDropboxFile(file.path, file.name, targetFolderId);
          imported++;
        } catch (error) {
          logger.error(`Erreur lors de l'import de ${file.name}:`, error);
          ToasterService.error(
            `Erreur lors de l'import de ${file.name}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
          );
        }
      }

      setImportProgress({ 
        current: imported, 
        total: files.length, 
        currentFile: '' 
      });

      if (imported > 0) {
        ToasterService.success(
          `${imported} fichier(s) importé(s) avec succès depuis Dropbox`
        );
        // Rafraîchir la vue actuelle
        await refresh(targetFolderId);
      }

    } catch (error) {
      logger.error('Erreur lors de l\'import Dropbox:', error);
      ToasterService.error(
        `Erreur lors de l'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }, [user?.id, importDropboxFile, refresh]);

  /**
   * Importer tous les fichiers d'un dossier Dropbox
   */
  const importDropboxFolder = useCallback(async (
    dropboxPath: string = '',
    options: DropboxImportOptions = {}
  ): Promise<void> => {
    try {
      const files = await getDropboxFiles(dropboxPath);
      const fileItems = files.filter(f => !f.is_directory);
      
      if (fileItems.length === 0) {
        ToasterService.info('Aucun fichier à importer dans ce dossier Dropbox');
        return;
      }

      await importDropboxFiles(fileItems, options);
    } catch (error) {
      logger.error('Erreur lors de l\'import du dossier Dropbox:', error);
      ToasterService.error(
        `Erreur lors de l'import du dossier: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }, [getDropboxFiles, importDropboxFiles]);

  return {
    importing,
    importProgress,
    getDropboxFiles,
    importDropboxFile,
    importDropboxFiles,
    importDropboxFolder,
  };
};
