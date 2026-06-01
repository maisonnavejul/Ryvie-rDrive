import { TdriveService, logger, ServiceName, Prefix, Consumes } from "../../core/platform/framework";
import WebServerAPI from "../../core/platform/services/webserver/provider";
import { FastifyInstance } from "fastify";
import { RcloneAPI } from "./api";
import { exec, spawn } from 'child_process';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import globalResolver from '../global-resolver';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

const execAsync = promisify(exec);

@ServiceName("rclone")
@Prefix("/api/v1")
export default class RcloneService extends TdriveService<RcloneAPI> implements RcloneAPI {
  version = "1";
  name = "rclone";
  
  // Configuration
  private REMOTE_NAME = '';
  private currentUserEmail = 'default@user.com'; // Email de l'utilisateur actuel
  
  // Génère un nom de remote basé sur l'email
  private getRemoteName(userEmail: string): string {
    const sanitized = userEmail.replace(/[@\.]/g, '_').toLowerCase();
    return `dropbox_${sanitized}`;
  }
  
  // Génère un nom de remote Google Drive basé sur l'email
  private getGoogleDriveRemoteName(userEmail: string): string {
    const sanitized = userEmail.replace(/[@\.]/g, '_').toLowerCase();
    return `googledrive_${sanitized}`;
  }
  // Service OAuth centralisé
  private OAUTH_SERVICE_URL = process.env.OAUTH_SERVICE_URL || 'https://cloudoauth-files.ryvie.fr';
  private INSTANCE_ID = process.env.INSTANCE_ID || this.generateInstanceId();

  private fs = require('fs');
  private path = require('path');

  constructor() {
    super();
    logger.info("Initializing Rclone service");
    logger.info(`Using OAuth service: ${this.OAUTH_SERVICE_URL}`);
    logger.info(`Instance ID: ${this.INSTANCE_ID}`);
  }

  /**
   * Génère un ID d'instance unique si non fourni
   */
  private generateInstanceId(): string {
    const id = uuidv4();
    logger.warn(`No INSTANCE_ID provided, generated: ${id}`);
    return id;
  }

  api(): RcloneAPI {
    return this;
  }

  /**
   * Récupère l'ID de la company depuis MongoDB
   */
  private async getCompanyId(): Promise<string> {
    try {
      const companies = await globalResolver.services.companies.getCompanies();
      const company = companies.getEntities()?.[0];
      
      if (!company) {
        throw new Error('No company found in database');
      }
      
      return company.id;
    } catch (error) {
      logger.error('Error getting company ID from database:', error);
      throw error;
    }
  }

  /**
   * Récupère l'ID de l'utilisateur depuis MongoDB
   */
  private async getUserId(): Promise<string> {
    try {
      const companyId = await this.getCompanyId();
      const users = await globalResolver.services.users.list(
        { limitStr: "1" },
        {},
        { 
          company: { id: companyId },
          user: { id: null, server_request: true } 
        } as any
      );
      const user = users.getEntities()?.[0];
      
      if (!user) {
        throw new Error('No user found in database');
      }
      
      return user.id;
    } catch (error) {
      logger.error('Error getting user ID from database:', error);
      throw error;
    }
  }

  async doInit(): Promise<this> {
    const fastify = this.context.getProvider<WebServerAPI>("webserver").getServer();
    
    fastify.register((instance, _opts, next) => {
      this.registerRoutes(instance);
      next();
    });
    
    logger.info("Initializing Rclone service");
    return this;
  }

  async doStart(): Promise<this> {
    logger.info("Starting Rclone service");
    return this;
  }
  
  /**
   * Calcule approximativement la taille d'un dossier en parcourant ses fichiers
   * Limite la profondeur et le nombre de fichiers pour éviter une surcharge
   * S'arrête et retourne -1 si la taille dépasse 5 Go
   */
  private async approximateFolderSize(folderPath: string, depth: number = 0): Promise<number> {
    // Seuil de 5 Go en octets
    const SIZE_THRESHOLD = 5 * 1024 * 1024 * 1024;
    
    // Limiter la profondeur de récursion pour éviter les performances
    if (depth > 2) {
      return 1024 * 1024 * 10; // Retourner 10MB pour les dossiers profonds
    }
    
    try {
      const remotePath = `${this.REMOTE_NAME}:${folderPath}`;
      const cmd = `rclone lsjson "${remotePath}" --max-depth 1 --fast-list`;
      
      const result = await new Promise<string>((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            logger.warn(`Erreur lors du calcul de la taille du dossier ${folderPath}:`, error);
            reject(error);
            return;
          }
          resolve(stdout);
        });
      });
      
      const files = JSON.parse(result || '[]');
      
      // Limiter le nombre de fichiers pour le calcul
      const MAX_FILES = 20;
      const sampleFiles = files.length > MAX_FILES ? files.slice(0, MAX_FILES) : files;
      
      let totalSize = 0;
      let fileCount = 0;
      
      // Calculer la taille des fichiers et sous-dossiers
      for (const file of sampleFiles) {
        // Vérifier si on a déjà dépassé le seuil de 5 Go
        if (totalSize > SIZE_THRESHOLD) {
          logger.info(`Dossier ${folderPath} dépasse le seuil de 5 Go, arrêt du calcul`); 
          return -1; // Code spécial pour indiquer > 5 Go
        }
        
        if (!file.IsDir) {
          totalSize += file.Size || 0;
          fileCount++;
        } else if (depth < 2) {
          // Récursion limitée pour les sous-dossiers
          const subFolderPath = `${folderPath}${folderPath ? '/' : ''}${file.Name}`;
          const subFolderSize = await this.approximateFolderSize(subFolderPath, depth + 1);
          
          // Si un sous-dossier est déjà trop grand
          if (subFolderSize === -1) {
            return -1;
          }
          
          totalSize += subFolderSize;
        }
      }
      
      // Extrapoler la taille si nous n'avons pas traité tous les fichiers
      if (files.length > MAX_FILES) {
        const averageSize = fileCount > 0 ? totalSize / fileCount : 0;
        totalSize = Math.round(averageSize * files.length);
      }
      
      // Vérification finale du seuil de 5 Go
      if (totalSize > SIZE_THRESHOLD) {
        logger.info(`Dossier ${folderPath} dépasse le seuil de 5 Go après extrapolation`); 
        return -1; // Code spécial pour indiquer > 5 Go
      }
      
      return totalSize;
    } catch (error) {
      logger.error(`Erreur lors du calcul de la taille du dossier ${folderPath}:`, error);
      return 0;
    }
  }
  
  /**
   * Formate la taille d'un fichier en format lisible
   */
  private formatFileSize(size: number): string {
    // Code spécial -1 indique une taille > 5 Go
    if (size === -1) {
      return '> 5 Go';
    }
    
    if (size <= 0) return '0 B';
    
    // Taille supérieure à 100MB mais inférieure à 5GB
    if (size > 1024 * 1024 * 100) {
      return '> 100 MB';
    }
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(size) / Math.log(1024));
    const formattedSize = parseFloat((size / Math.pow(1024, i)).toFixed(2));
    
    return `${formattedSize} ${units[i]}`;
  }
  
  async getAuthUrl(request?: any): Promise<string> {
    // Construire l'URL de callback pour cette instance
    let callbackBase = '/api/v1/oauth/success';
    if (request) {
      const xfProto = (request.headers?.['x-forwarded-proto'] as string) || request.protocol || 'http';
      const xfHost = (request.headers?.['x-forwarded-host'] as string) || request.headers?.host || 'localhost';
      const protocol = xfProto.split(',')[0].trim();
      const host = xfHost.split(',')[0].trim();
      callbackBase = `${protocol}://${host}/api/v1/oauth/success`;
    }
    
    const userEmail = request?.query?.userEmail || 'default@user.com';
    
    // Rediriger vers le service OAuth centralisé
    const authUrl = `${this.OAUTH_SERVICE_URL}/oauth/dropbox/start?instance_id=${encodeURIComponent(this.INSTANCE_ID)}&user_email=${encodeURIComponent(userEmail)}&callback_base=${encodeURIComponent(callbackBase)}`;

    logger.info('→ Redirecting to centralized OAuth service:', authUrl);
    return authUrl;
  }
  
  async getGoogleDriveAuthUrl(request?: any): Promise<string> {
    // Construire l'URL de callback pour cette instance
    let callbackBase = '/api/v1/oauth/success';
    if (request) {
      const xfProto = (request.headers?.['x-forwarded-proto'] as string) || request.protocol || 'http';
      const xfHost = (request.headers?.['x-forwarded-host'] as string) || request.headers?.host || 'localhost';
      const protocol = xfProto.split(',')[0].trim();
      const host = xfHost.split(',')[0].trim();
      callbackBase = `${protocol}://${host}/api/v1/oauth/success`;
    }
    
    const userEmail = request?.query?.userEmail || 'default@user.com';
    
    // Rediriger vers le service OAuth centralisé
    const authUrl = `${this.OAUTH_SERVICE_URL}/oauth/google/start?instance_id=${encodeURIComponent(this.INSTANCE_ID)}&user_email=${encodeURIComponent(userEmail)}&callback_base=${encodeURIComponent(callbackBase)}`;

    logger.info('→ Redirecting to centralized OAuth service for Google:', authUrl);
    return authUrl;
  }

  /**
   * Liste les fichiers Dropbox via rclone - WRAPPER POUR COMPATIBILITÉ
   */
  async listFiles(path: string): Promise<any[]> {
    return await this.listCloudFiles(path, 'dropbox');
  }
  
  /**
   * Calcule approximativement la taille d'un dossier Google Drive en parcourant ses fichiers
   * Limite la profondeur et le nombre de fichiers pour éviter une surcharge
   * S'arrête et retourne -1 si la taille dépasse 5 Go
   */
  private async approximateGoogleDriveFolderSize(folderPath: string, remoteName: string, depth: number = 0): Promise<number> {
    // Seuil de 5 Go en octets
    const SIZE_THRESHOLD = 5 * 1024 * 1024 * 1024;
    
    // Limiter la profondeur de récursion pour éviter les performances
    if (depth > 2) {
      return 1024 * 1024 * 10; // Retourner 10MB pour les dossiers profonds
    }
    
    try {
      const remotePath = `${remoteName}:${folderPath}`;
      const cmd = `rclone lsjson "${remotePath}" --max-depth 1`;
      
      const result = await new Promise<string>((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            logger.warn(`Erreur lors du calcul de la taille du dossier Google Drive ${folderPath}:`, error);
            reject(error);
            return;
          }
          resolve(stdout);
        });
      });
      
      const files = JSON.parse(result || '[]');
      
      // Limiter le nombre de fichiers pour le calcul
      const MAX_FILES = 20;
      const sampleFiles = files.length > MAX_FILES ? files.slice(0, MAX_FILES) : files;
      
      let totalSize = 0;
      let fileCount = 0;
      
      // Calculer la taille des fichiers et sous-dossiers
      for (const file of sampleFiles) {
        // Vérifier si on a déjà dépassé le seuil de 5 Go
        if (totalSize > SIZE_THRESHOLD) {
          logger.info(`Dossier Google Drive ${folderPath} dépasse le seuil de 5 Go, arrêt du calcul`); 
          return -1; // Code spécial pour indiquer > 5 Go
        }
        
        if (!file.IsDir) {
          totalSize += file.Size || 0;
          fileCount++;
        } else if (depth < 2) {
          // Récursion limitée pour les sous-dossiers
          const subFolderPath = `${folderPath}${folderPath ? '/' : ''}${file.Name}`;
          const subFolderSize = await this.approximateGoogleDriveFolderSize(subFolderPath, remoteName, depth + 1);
          
          // Si un sous-dossier est déjà trop grand
          if (subFolderSize === -1) {
            return -1;
          }
          
          totalSize += subFolderSize;
        }
      }
      
      // Extrapoler la taille si nous n'avons pas traité tous les fichiers
      if (files.length > MAX_FILES) {
        const averageSize = fileCount > 0 ? totalSize / fileCount : 0;
        totalSize = Math.round(averageSize * files.length);
      }
      
      // Vérification finale du seuil de 5 Go
      if (totalSize > SIZE_THRESHOLD) {
        logger.info(`Dossier Google Drive ${folderPath} dépasse le seuil de 5 Go après extrapolation`); 
        return -1; // Code spécial pour indiquer > 5 Go
      }
      
      return totalSize;
    } catch (error) {
      logger.error(`Erreur lors du calcul de la taille du dossier Google Drive ${folderPath}:`, error);
      return 0;
    }
  }
  
  /**
   * Liste les fichiers cloud unifiée (Dropbox/Google Drive) via rclone
   * REMPLACE listFiles ET listGoogleDriveFiles
   */
  public async listCloudFiles(path: string, provider: 'dropbox' | 'googledrive', remoteName?: string): Promise<any[]> {
    // CORRECTION CRITIQUE : Générer le bon remote pour chaque provider
    let actualRemoteName: string;
    if (remoteName) {
      actualRemoteName = remoteName;
    } else if (provider === 'googledrive') {
      actualRemoteName = this.getGoogleDriveRemoteName(this.currentUserEmail);
    } else {
      // Pour Dropbox, utiliser la méthode getRemoteName au lieu de this.REMOTE_NAME
      actualRemoteName = this.getRemoteName(this.currentUserEmail);
    }
    
    logger.info(`📁 Listing ${provider} files at path: ${path} with remote: ${actualRemoteName}`);
    
    // Debug: Log détaillé des remotes utilisés
    console.log(`🔍 BACKEND DEBUG FIXED:`, {
      provider,
      path,
      requestedRemoteName: remoteName,
      actualRemoteName,
      dropboxRemote: this.getRemoteName(this.currentUserEmail),
      googleDriveRemote: this.getGoogleDriveRemoteName(this.currentUserEmail),
      currentUserEmail: this.currentUserEmail
    });
    
    return new Promise(async (resolve, reject) => {
      const remotePath = `${actualRemoteName}:${path}`;
      // Construire les arguments rclone en mode streaming pour éviter maxBuffer
      const args: string[] = ['lsjson', remotePath, '--fast-list'];
      if (provider === 'googledrive') {
        args.push('--hash');
      }
      logger.info(`🔧 Executing ${provider} rclone (spawn) with args:`, args.join(' '));

      const child = spawn('rclone', args);
      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutData += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const s = chunk.toString('utf8');
        stderrData += s;
      });

      child.on('error', (err) => {
        logger.error(`❌ ${provider} rclone process error:`, err);
        reject(err);
      });

      child.on('close', async (code) => {
        if (code !== 0) {
          logger.error(`❌ ${provider} rclone exited with code ${code}:`, stderrData);
          return reject(new Error(`rclone lsjson failed with code ${code}`));
        }

        try {
          const files = JSON.parse(stdoutData || '[]');
          logger.info(`📊 ${provider} found ${files.length} files/folders`);

          console.log(`📋 RCLONE RETURNED FOR ${provider}:`, {
            provider,
            actualRemoteName,
            fileCount: files.length,
            files: files.map((f: any) => ({ name: f.Name, isDir: f.IsDir, size: f.Size }))
          });

          const previousRemoteName = this.REMOTE_NAME;
          this.REMOTE_NAME = actualRemoteName;

          const transformedFiles = await Promise.all(files.map(async (file: any) => {
            let size = file.Size > 0 ? file.Size : 0;
            if (file.IsDir) {
              size = await this.approximateFolderSize(`${path}${path ? '/' : ''}${file.Name}`);
            }
            const formattedSize = size > 1024 * 1024 * 100 ? -1 : size;
            return {
              id: file.ID || file.Path,
              name: file.Name,
              path: file.Path,
              size: formattedSize,
              display_size: this.formatFileSize(size),
              is_directory: file.IsDir || false,
              mime_type: file.MimeType || (file.IsDir ? 'inode/directory' : 'application/octet-stream'),
              modified_at: file.ModTime,
              source: provider
            };
          }));

          this.REMOTE_NAME = previousRemoteName;
          resolve(transformedFiles);
        } catch (parseError) {
          logger.error(`📁 Failed to parse ${provider} rclone output:`, { parseError, stdout: stdoutData });
          reject(new Error(`Failed to parse ${provider} file list`));
        }
      });
    });
  }

  /**
   * Liste les fichiers Google Drive via rclone - WRAPPER POUR COMPATIBILITÉ
   */
  public async listGoogleDriveFiles(path: string, remoteName: string): Promise<any[]> {
    return await this.listCloudFiles(path, 'googledrive', remoteName);
  }

  /**
   * Synchronisation Dropbox vers Twake Drive avec map des dossiers préalablement créés
   * Phase 2 de la synchronisation en 2 temps - UTILISE LA MÉTHODE UNIFIÉE
   */
  private async syncDropboxWithFolderMap(
    dropboxPath: string,
    driveParentId: string,
    userEmail: string,
    executionContext: any,
    folderMap: Record<string, string>, // Map: chemin dossier -> ID dossier Twake
    filesToSync?: any[] // Liste optionnelle de fichiers filtrés à synchroniser
  ): Promise<{ success: boolean; message: string; filesProcessed: number }> {
    
    // UTILISER LA MÉTHODE UNIFIÉE POUR DROPBOX
    return await this.syncCloudWithFolderMap(
      dropboxPath,
      driveParentId,
      userEmail,
      executionContext,
      folderMap,
      'dropbox',
      filesToSync
    );
  }



  /**
   * Synchronisation Dropbox vers Twake Drive avec streaming direct
   * Utilise rclone lsjson + rclone cat pour un streaming efficace
   */
  private async syncDropboxIncremental(
    dropboxPath: string,
    driveParentId: string,
    userEmail: string,
    executionContext: any
  ): Promise<{ success: boolean; message: string; filesProcessed: number }> {
    
    // Mettre à jour le remote pour cet utilisateur
    this.currentUserEmail = userEmail;
    this.REMOTE_NAME = this.getRemoteName(userEmail);
    logger.info(`🔧 Using remote: ${this.REMOTE_NAME}`);
    
    try {
      // 1. Lister tous les fichiers Dropbox récursivement
      const remotePath = `${this.REMOTE_NAME}:${dropboxPath}`;
      const listCommand = `rclone lsjson --recursive "${remotePath}" --fast-list`;
      
      logger.info(`📋 Listing files: ${listCommand}`);
      const { stdout } = await execAsync(listCommand, { maxBuffer: 100 * 1024 * 1024 });
      
      const files = JSON.parse(stdout).filter((item: any) => !item.IsDir);
      logger.info(`📊 Found ${files.length} files to sync`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      // 2. Traiter les fichiers par lots pour éviter la surcharge
      const batchSize = 5;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (file: any) => {
            const filePath = dropboxPath ? `${dropboxPath}/${file.Path}` : file.Path;
            return await this.syncSingleFileByStream(filePath, file.Path, driveParentId, executionContext);
          })
        );
        
        // Compter les résultats
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            processedCount++;
            logger.debug(`✅ Synced: ${batch[index].Path}`);
          } else {
            errorCount++;
            logger.error(`❌ Failed to sync ${batch[index].Path}:`, result.reason);
          }
        });
        
        // Petite pause entre les lots
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const message = `Synchronisation completed. ${processedCount} files synced successfully${errorCount > 0 ? `, ${errorCount} errors` : ''}.`;
      logger.info(`✅ ${message}`);
      
      return {
        success: true,
        message,
        filesProcessed: processedCount
      };
      
    } catch (error) {
      logger.error('❌ Sync failed:', error);
      throw new Error(`Synchronisation failed: ${error.message}`);
    }
  }

  /**
   * Synchronise un seul fichier par streaming direct avec rclone cat
   */
  private async syncSingleFileByStream(
    dropboxFilePath: string,
    fileName: string,
    driveParentId: string,
    executionContext: any
  ): Promise<void> {
    
    const remotePath = `${this.REMOTE_NAME}:${dropboxFilePath}`;
    
    return new Promise((resolve, reject) => {
      // Créer un stream avec rclone cat
      const rcloneProcess = spawn('rclone', ['cat', remotePath]);
      
      const chunks: Buffer[] = [];
      let totalSize = 0;
      
      rcloneProcess.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });
      
      rcloneProcess.stderr.on('data', (data: Buffer) => {
        logger.error(`❌ rclone cat stderr for ${fileName}:`, data.toString());
      });
      
      rcloneProcess.on('close', async (code: number) => {
        if (code !== 0) {
          reject(new Error(`rclone cat failed with code ${code} for ${fileName}`));
          return;
        }
        
        try {
          // Combiner tous les chunks en un seul buffer
          const fileBuffer = Buffer.concat(chunks);
          
          // Déterminer le type MIME
          const mimeType = this.getMimeType(fileName);
          
          // Créer les dossiers nécessaires si le fichier a un chemin avec des sous-dossiers
          const actualParentId = await this.ensureFoldersExist(dropboxFilePath, driveParentId, executionContext);
          
          // Extraire le nom du fichier sans le chemin
          const actualFileName = dropboxFilePath.split('/').pop() || fileName;
          
          // Sauvegarder vers Twake Drive dans le bon dossier parent
          await this.saveStreamToTwakeDrive(fileBuffer, actualFileName, mimeType, actualParentId, executionContext);
          
          logger.debug(`✅ Streamed ${fileName} (${totalSize} bytes) to Twake Drive`);
          resolve();
          
        } catch (error) {
          logger.error(`❌ Failed to save ${fileName} to Twake Drive:`, error);
          reject(error);
        }
      });
      
      rcloneProcess.on('error', (error: Error) => {
        logger.error(`❌ rclone cat process error for ${fileName}:`, error);
        reject(error);
      });
    });
  }



  /**
   * Compte le nombre de fichiers dans un dossier récursivement
   */
  private async countFilesInDirectory(dir: string): Promise<number> {
    let count = 0;
    
    const scan = (currentDir: string) => {
      if (!fs.existsSync(currentDir)) return;
      
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scan(fullPath); // Récursion
        } else {
          count++;
        }
      }
    };
    
    scan(dir);
    return count;
  }

  /**
   * Détermine le type MIME d'un fichier basé sur son extension
   */
  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    
    const mimeTypes: { [key: string]: string } = {
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Crée tous les dossiers nécessaires dans Twake Drive basé sur la structure du dossier temporaire
   */
  private async createFoldersFromTempDir(
    tempDir: string,
    driveParentId: string
  ): Promise<Map<string, string>> {
    
    const folderMap = new Map<string, string>();
    folderMap.set('', driveParentId); // Racine
    
    // Pour simplifier, on va créer les dossiers à la volée lors de l'upload des fichiers
    // Cela évite la complexité de parcourir tous les dossiers à l'avance
    
    return folderMap;
  }

  /**
   * Upload un seul fichier depuis le dossier temporaire vers Twake Drive
   */
  private async uploadSingleFileFromTemp(
    filePath: string,
    tempDir: string,
    folderMap: Map<string, string>,
    driveParentId: string,
    executionContext: any
  ): Promise<'new' | 'updated' | 'skipped'> {
    
    // Calculer le chemin relatif
    const relativePath = path.relative(tempDir, filePath);
    const fileName = path.basename(filePath);
    const dirPath = path.dirname(relativePath);
    
    logger.debug(`📄 Processing file: ${relativePath}`);
    
    // Déterminer le dossier parent dans Drive
    let parentId = driveParentId;
    if (dirPath !== '.') {
      parentId = await this.ensureFolderExists(dirPath, folderMap, driveParentId);
    }
    
    // Lire le fichier
    const fileBuffer = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    
    // Déterminer le type MIME
    const mimeType = this.getMimeType(fileName);
    
    // Pour simplifier, on va toujours uploader le fichier
    // La détection de doublons sera gérée par rclone sync lui-même
    try {
      await this.saveStreamToTwakeDrive(fileBuffer, fileName, mimeType, parentId, executionContext);
      logger.debug(`✅ Uploaded: ${relativePath}`);
      return 'new';
    } catch (error) {
      logger.error(`❌ Failed to upload ${relativePath}:`, error);
      throw error;
    }
  }

  /**
   * S'assure qu'un dossier existe dans Drive et retourne son ID
   */
  private async ensureFolderExists(
    folderPath: string,
    folderMap: Map<string, string>,
    rootParentId: string
  ): Promise<string> {
    
    if (folderMap.has(folderPath)) {
      return folderMap.get(folderPath)!;
    }
    
    // Créer le dossier via l'API interne (simplifié)
    // Pour l'instant, on va retourner le rootParentId
    // TODO: Implémenter la création de dossiers via l'API interne
    
    folderMap.set(folderPath, rootParentId);
    return rootParentId;
  }

  /**
   * Crée automatiquement les dossiers nécessaires pour un chemin de fichier Dropbox
   * Ex: "logo/subfolder/photo.png" créera les dossiers "logo" puis "logo/subfolder"
   */
  private async ensureFoldersExist(
    dropboxFilePath: string,
    rootParentId: string,
    executionContext: any
  ): Promise<string> {
    
    // Extraire le chemin du dossier (sans le nom du fichier)
    const pathParts = dropboxFilePath.split('/');
    const fileName = pathParts.pop(); // Enlever le nom du fichier
    
    // Si pas de dossiers à créer, retourner le parent racine
    if (pathParts.length === 0) {
      return rootParentId;
    }
    
    let currentParentId = rootParentId;
    
    // Créer chaque dossier dans l'ordre hiérarchique
    for (const folderName of pathParts) {
      try {
        logger.debug(`📁 Creating folder: ${folderName} in parent ${currentParentId}`);
        
        // Créer un contexte spécifique pour la création de dossiers
        const folderContext = {
          ...executionContext,
          user: {
            ...executionContext.user,
            application_id: null // Requis pour la création de dossiers
          }
        };
        
        // Pour créer un dossier, il faut utiliser la même signature que pour les fichiers
        // mais avec des données spécifiques aux dossiers
        const folderData = {
          parent_id: currentParentId,
          name: folderName,
          is_directory: true
        };
        
        // Pas de version data pour les dossiers
        const versionData = null;
        
        const createdFolder = await globalResolver.services.documents.documents.create(
          null, // Pas de fichier physique pour un dossier
          folderData,
          versionData,
          folderContext
        );
        
        currentParentId = createdFolder.id;
        logger.debug(`✅ Folder created: ${folderName} with ID ${currentParentId}`);
        
      } catch (error) {
        // Si le dossier existe déjà, essayer de le récupérer
        logger.debug(`⚠️ Folder ${folderName} might already exist, trying to find it...`);
        
        try {
          // Rechercher le dossier existant via browse
          const folderContext = {
            ...executionContext,
            user: {
              ...executionContext.user,
              application_id: null // Requis pour browse
            }
          };
          
          const browseResult = await globalResolver.services.documents.documents.browse(
            currentParentId,
            {},
            folderContext
          );
          
          // Chercher le dossier par nom dans les résultats
          const existingFolder = browseResult.children?.find(
            (item: any) => item.name === folderName && item.is_directory
          );
          
          if (existingFolder) {
            currentParentId = existingFolder.id;
            logger.debug(`✅ Found existing folder: ${folderName} with ID ${currentParentId}`);
          } else {
            logger.error(`❌ Could not create or find folder: ${folderName}`);
            throw new Error(`Failed to create or find folder: ${folderName}`);
          }
        } catch (findError) {
          logger.error(`❌ Error finding existing folder ${folderName}:`, findError);
          throw findError;
        }
      }
    }
    
    return currentParentId;
  }

  /**
   * Save a file buffer to Twake Drive using internal services
   */
  private async saveStreamToTwakeDrive(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    driveParentId: string,
    executionContext: any
  ): Promise<void> {
    try {
      // Create a readable stream from the buffer
      const { Readable } = require('stream');
      const fileStream = new Readable({
        read() {
          this.push(fileBuffer);
          this.push(null); // End of stream
        }
      });

      // Create execution context for Twake Drive operations
      // For server-side operations, we need to create a proper context
      const context = executionContext;
      
      // Upload options for the file
      const uploadOptions = {
        totalChunks: 1,
        totalSize: fileBuffer.length,
        chunkNumber: 1,
        filename: fileName,
        type: mimeType,
        waitForThumbnail: false,
        ignoreThumbnails: false,
      };

      // Save the file using Twake Drive's file service
      const savedFile = await globalResolver.services.files.save(
        null, // No existing file ID
        fileStream,
        uploadOptions,
        context,
      );

      logger.info(`📁 File saved to storage: ${savedFile.id} (${fileName})`);

      // Create drive item metadata
      const driveItemData = {
        parent_id: driveParentId,
        name: fileName,
        is_directory: false,
        extension: fileName.split('.').pop() || '',
        size: fileBuffer.length,
      };

      // Create file version metadata
      const versionData = {
        filename: fileName,
        file_size: fileBuffer.length,
        file_metadata: {
          source: 'internal',
          external_id: savedFile.id,
          name: fileName,
          mime: mimeType,
          size: fileBuffer.length,
          thumbnails: savedFile.thumbnails || [],
        },
      };

      // Create the drive item using the documents service
      const driveItem = await globalResolver.services.documents.documents.create(
        savedFile,
        driveItemData,
        versionData,
        context,
      );

      logger.info(`✅ Drive item created: ${driveItem.id} (${fileName}) in folder ${driveParentId}`);
      
    } catch (error) {
      logger.error(`❌ Failed to save ${fileName} to Twake Drive:`, error);
      throw error;
    }
  }

  private registerRoutes(fastify: FastifyInstance) {
    // Register routes
    const apiPrefix = "/api/v1";
    
    // 1) Generate AuthUrl for Dropbox OAuth
    // Le frontend appelle /api/v1/drivers/Dropbox
    fastify.get(`${apiPrefix}/drivers/Dropbox`, async (request: any, reply) => {
      // Récupérer l'email utilisateur depuis les query parameters
      const userEmail = request.query.userEmail as string || 'default@user.com';
      logger.info('📧 Email utilisateur reçu:', userEmail);
      
      // Mettre à jour le remote pour cet utilisateur
      this.currentUserEmail = userEmail;
      this.REMOTE_NAME = this.getRemoteName(userEmail);
      logger.info('🔧 Remote name mis à jour:', this.REMOTE_NAME);
      
      const authUrl = await this.getAuthUrl(request);
      logger.info('→ AuthUrl generated:', authUrl);
      // Important: Format exact attendu par le frontend
      // Pas de .type() pour laisser Fastify définir correctement l'en-tête Content-Type
      return reply.send({ addition: { AuthUrl: authUrl } });

    });
    
    // 2) Nouveau endpoint pour callback OAuth centralisé
    fastify.get(`${apiPrefix}/oauth/success`, async (request: any, reply) => {
      const success = request.query.success as string;
      const provider = request.query.provider as string;
      const userEmail = request.query.user_email as string;
      const instanceId = request.query.instance_id as string;
      
      if (success === 'true' && userEmail && instanceId) {
        logger.info(`✅ OAuth success for ${provider} - ${userEmail}`);
        
        try {
          // Normaliser le provider (google -> googledrive pour rclone)
          const normalizedProvider = provider === 'google' ? 'googledrive' : provider;
          
          // Récupérer le token depuis le service OAuth centralisé
          const tokenResponse = await fetch(`${this.OAUTH_SERVICE_URL}/api/token/get`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instance_id: instanceId,
              user_email: userEmail,
              provider: provider // Utiliser le provider original pour la requête
            })
          });
          
          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            logger.error(`❌ Failed to get token from OAuth service: ${tokenResponse.status} - ${errorText}`);
            throw new Error('Failed to retrieve token');
          }
          
          const tokenData = await tokenResponse.json();
          logger.info(`📥 Token retrieved for ${userEmail} (${provider})`, { hasAccessToken: !!tokenData.access_token, hasRefreshToken: !!tokenData.refresh_token });
          
          // Créer le remote rclone avec le token
          const remoteName = normalizedProvider === 'googledrive' 
            ? this.getGoogleDriveRemoteName(userEmail)
            : this.getRemoteName(userEmail); // Utiliser le nom basé sur l'email pour Dropbox
          
          // Convertir le timestamp en date ISO pour rclone
          const expiryTimestamp = tokenData.expiry || tokenData.expires_at;
          const expiryISO = expiryTimestamp ? new Date(expiryTimestamp).toISOString() : undefined;
          
          const tokenForRclone = JSON.stringify({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expiry: expiryISO
          });
          
          const configPath = '/root/.config/rclone/rclone.conf';
          const deleteCmd = `rclone --config ${configPath} config delete ${remoteName} 2>/dev/null || true`;
          const createCmd = normalizedProvider === 'googledrive'
            ? `rclone --config ${configPath} config create ${remoteName} drive token '${tokenForRclone}' --non-interactive`
            : `rclone --config ${configPath} config create ${remoteName} dropbox token '${tokenForRclone}' --non-interactive`;
          
          logger.info(`🔧 Creating rclone remote: ${remoteName} (${normalizedProvider})`);
          
          const { exec } = require('child_process');
          exec(`${deleteCmd} && ${createCmd}`, (err: any, stdout: string, stderr: string) => {
            if (err) {
              logger.error(`❌ rclone config failed for ${remoteName}:`, { error: err.message, stderr, stdout });
            } else {
              logger.info(`✅ Remote "${remoteName}" created successfully`, { stdout, stderr });
            }
          });
          
        } catch (error) {
          logger.error(`❌ Error creating rclone remote:`, error);
        }
        
        // Redirection vers le frontend
        const xfProto = (request.headers?.['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || request.protocol || 'http';
        const xfHost = (request.headers?.['x-forwarded-host'] as string)?.split(',')[0]?.trim() || request.headers?.host || 'localhost';
        const redirectUrl = `${xfProto}://${xfHost}/client`;
        
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>${provider} Authentication Successful</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
              .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
              .success { color: #28a745; font-size: 18px; margin-bottom: 20px; }
              .redirect { color: #6c757d; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅ ${provider} Authentication Successful!</div>
              <div class="redirect">Redirecting to rDrive...</div>
            </div>
            <script>
              setTimeout(() => {
                window.location.href = '${redirectUrl}?_reload=' + Date.now();
              }, 2000);
            </script>
          </body>
          </html>
        `;
        
        return reply.type('text/html').send(htmlResponse);
      } else {
        return reply.status(400).send('OAuth failed');
      }
    });
    
    // 2.1) OAuth callback legacy (rétrocompatibilité) - DÉSACTIVÉ car géré par le service OAuth centralisé
    // Le service OAuth centralisé gère maintenant l'échange de tokens
    /*
    fastify.get(`${apiPrefix}/recover/Dropbox`, async (request: any, reply) => {
      const fullUrl = `${request.protocol}://${request.hostname}${request.url}`;
      logger.info('🔔 Callback received:', fullUrl);

      const code = request.query.code as string | undefined;
      if (!code) {
        return reply.status(400).send('❌ Missing code');
      }

      // LEGACY CODE - Not used anymore with centralized OAuth service
      const params = new URLSearchParams({
        code: code,
        grant_type: 'authorization_code',
        client_id: 'legacy',
        client_secret: 'legacy',
        redirect_uri: 'legacy'
      });

      try {
        const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        });
        
        const tokenJson = await tokenRes.json();
        if (!tokenRes.ok) {
          logger.error('Token error:', tokenJson);
          return reply.status(500).send('Token exchange failed');
        }

        // Create rclone remote avec nom fixe pour utilisation depuis l'hôte
        const remoteName = this.REMOTE_NAME; // Utilise 'test4'
        
        const tokenForRclone = JSON.stringify({
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expiry: tokenJson.expires_at
        });
        
        // D'abord, supprimer le remote s'il existe déjà, puis le créer
        // Spécifier explicitement le chemin de configuration
        const configPath = '/root/.config/rclone/rclone.conf';
        const deleteCmd = `rclone --config ${configPath} config delete ${remoteName} 2>/dev/null || true`;
        const createCmd = `rclone --config ${configPath} config create ${remoteName} dropbox token '${tokenForRclone}' --non-interactive`;
        
        exec(`${deleteCmd} && ${createCmd}`, (err, stdout, stderr) => {
          if (err) {
            logger.error('rclone config failed:', { error: err.message, stderr, stdout });
          } else {
            logger.info(`✅ Remote "${remoteName}" created in rclone.conf`);
            logger.info('rclone stdout:', stdout);
          }
        });

        // Redirection automatique vers rdrive après authentification réussie
        // 1) Priorité: en-têtes X-Forwarded-* fournis par Nginx (préservent le port)
        let redirectUrl: string;
        const xfProtoHeader = request.headers?.['x-forwarded-proto'] as string | undefined;
        const xfHostHeader = request.headers?.['x-forwarded-host'] as string | undefined;
        const xfProto = xfProtoHeader ? xfProtoHeader.split(',')[0].trim() : undefined;
        const xfHost = xfHostHeader ? xfHostHeader.split(',')[0].trim() : undefined;
        if (xfProto && xfHost) {
          redirectUrl = `${xfProto}://${xfHost}/client`;
          logger.info(`Redirection via X-Forwarded headers: ${redirectUrl}`);
        }
        
        // 2) Fallback: Origin
        if (!redirectUrl) {
          const origin = request.headers.origin as string | undefined;
          if (origin) {
            redirectUrl = `${origin}/client`;
            logger.info(`Redirection via Origin: ${redirectUrl}`);
          }
        }
        
        // 3) Fallback: Referer
        if (!redirectUrl) {
          try {
            const referer = request.headers.referer as string | undefined;
            if (referer) {
              const refererUrl = new URL(referer);
              const port = refererUrl.port;
              const hostWithPort = port ? `${refererUrl.hostname}:${port}` : refererUrl.hostname;
              redirectUrl = `${refererUrl.protocol}//${hostWithPort}/client`;
              logger.info(`Redirection via Referer: ${redirectUrl}`);
            }
          } catch (e) {
            logger.info(`Erreur lors du parsing du Referer: ${e.message}`);
          }
        }
        
        // 4) Fallback final: Host + protocol de la requête
        if (!redirectUrl) {
          const reqHost = request.headers.host || request.hostname;
          const reqProto = (request.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || request.protocol || 'http';
          redirectUrl = `${reqProto}://${reqHost}/client`;
          logger.info(`Fallback final: ${redirectUrl}`);
        }
        
        logger.info(`🔀 Redirecting to rdrive: ${redirectUrl}`);
        
        // Envoyer une page HTML avec redirection automatique
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Dropbox Authentication Successful</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
              .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
              .success { color: #28a745; font-size: 18px; margin-bottom: 20px; }
              .redirect { color: #6c757d; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅ Dropbox Authentication Successful!</div>
              <div class="redirect">Redirecting to rdrive...</div>
            </div>
            <script>
              // Redirection automatique après 2 secondes avec rechargement forcé
              setTimeout(() => {
                // Forcer un rechargement complet avec vidage du cache
                // Ajouter un timestamp pour forcer le reload
                const url = '${redirectUrl}' + (('${redirectUrl}'.includes('?')) ? '&' : '?') + '_reload=' + Date.now();
                window.location.href = url;
                // Alternative: forcer un hard reload si supporté
                if (window.location.reload) {
                  setTimeout(() => window.location.reload(true), 100);
                }
              }, 2000);
            </script>
          </body>
          </html>
        `;
        
        return reply.type('text/html').send(htmlResponse);
      } catch (error) {
        logger.error('Exchange error:', error);
        return reply.status(500).send('Internal OAuth error');
      }
    });
    */
    
    // 2.5) Status check - ENDPOINT LÉGER pour vérifier la connexion sans lister les fichiers
    fastify.get(`${apiPrefix}/files/rclone/status`, {
      preValidation: fastify.authenticate
    }, async (request: any, reply) => {
      const userEmail = request.query.userEmail as string || 'default@user.com';
      const provider = (request.query.provider as string || 'dropbox') as 'dropbox' | 'googledrive';
      
      try {
        logger.info(`🔍 Checking ${provider} connection status for user: ${userEmail}`);
        
        // Configurer l'utilisateur courant
        this.currentUserEmail = userEmail;
        
        // Déterminer le remote name selon le provider
        const remoteName = provider === 'googledrive' 
          ? this.getGoogleDriveRemoteName(userEmail)
          : this.getRemoteName(userEmail);
        
        // 1. Vérifier si le remote existe dans la configuration rclone
        const { exec } = require('child_process');
        const configPath = '/root/.config/rclone/rclone.conf';
        
        return new Promise((resolve) => {
          exec(`rclone --config ${configPath} listremotes`, (err: any, stdout: string, stderr: string) => {
            if (err) {
              logger.error(`❌ Failed to list remotes:`, err);
              return resolve(reply.send({ connected: false, error: 'Failed to check remotes' }));
            }
            
            // Vérifier si le remote existe dans la liste
            const remotes = stdout.split('\n').map(r => r.trim().replace(':', ''));
            const remoteExists = remotes.includes(remoteName);
            
            if (!remoteExists) {
              logger.info(`❌ ${provider} remote "${remoteName}" not found in config`);
              return resolve(reply.send({ connected: false, provider, remoteName, userEmail }));
            }
            
            // 2. Vérifier que le token est encore valide en faisant un appel léger
            // lsjson avec --max-depth 1 sur la racine, timeout court
            logger.info(`🔑 Remote "${remoteName}" exists, verifying token validity...`);
            const testCmd = `rclone lsjson --max-depth 1 "${remoteName}:" --fast-list 2>&1`;
            exec(testCmd, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (testErr: any, testStdout: string, testStderr: string) => {
              if (testErr) {
                const errorOutput = testStderr || testStdout || testErr.message || '';
                // Détecter les erreurs de token expiré/invalide
                const isTokenError = errorOutput.includes('token') 
                  || errorOutput.includes('expired')
                  || errorOutput.includes('invalid_grant')
                  || errorOutput.includes('oauth2')
                  || errorOutput.includes('401')
                  || errorOutput.includes('403')
                  || errorOutput.includes('couldn\'t')
                  || errorOutput.includes('failed to')
                  || testErr.killed; // timeout = probablement token invalide
                  
                if (isTokenError) {
                  logger.warn(`⚠️ ${provider} token expired/invalid for "${remoteName}": ${errorOutput.substring(0, 200)}`);
                  return resolve(reply.send({ 
                    connected: false, 
                    provider, 
                    remoteName, 
                    userEmail,
                    reason: 'token_expired'
                  }));
                }
                
                // Autre erreur (réseau, etc.) - on considère comme non connecté
                logger.error(`❌ ${provider} verification failed: ${errorOutput.substring(0, 200)}`);
                return resolve(reply.send({ 
                  connected: false, 
                  provider, 
                  remoteName, 
                  userEmail,
                  reason: 'verification_failed'
                }));
              }
              
              // Token valide - la commande a réussi
              logger.info(`✅ ${provider} token valid for "${remoteName}"`);
              return resolve(reply.send({ 
                connected: true,
                provider,
                remoteName,
                userEmail
              }));
            });
          });
        });
        
      } catch (error) {
        logger.error(`❌ ${provider} status check error:`, error);
        return reply.send({ connected: false, error: error.message });
      }
    });
    
    // 3) List files - ENDPOINT UNIFIÉ pour Dropbox et Google Drive
    fastify.get(`${apiPrefix}/files/rclone/list`, {
      preValidation: fastify.authenticate
    }, async (request: any, reply) => {
      const path = (request.query.path as string) || '';
      const userEmail = request.query.userEmail as string || 'default@user.com';
      const provider = (request.query.provider as string || 'dropbox') as 'dropbox' | 'googledrive';
      
      try {
        logger.info(`📧 Listing ${provider} files for user: ${userEmail}, path: ${path}`);
        
        // Configurer l'utilisateur courant
        this.currentUserEmail = userEmail;
        
        // UTILISER LA MÉTHODE UNIFIÉE
        const files = await this.listCloudFiles(path, provider);
        return reply.send(files);
        
      } catch (error) {
        logger.error(`❌ ${provider} listing error:`, error);
        return reply.status(500).send({ error: 'Internal listing error', message: error.message });
      }
    });
    
    // 4) Download file - ENDPOINT UNIFIÉ pour télécharger un fichier Dropbox/Google Drive
    fastify.get(`${apiPrefix}/files/rclone/download`, {
      preValidation: fastify.authenticate
    }, async (request: any, reply) => {
      logger.info('📥 Download file endpoint called');
      logger.info('📥 Request query:', JSON.stringify(request.query));
      try {
        const path = (request.query.path as string) || '';
        const userEmail = request.query.userEmail as string || 'default@user.com';
        const provider = (request.query.provider as string || 'dropbox') as 'dropbox' | 'googledrive';
        
        logger.info(`📥 Download ${provider} file - path: "${path}", userEmail: "${userEmail}"`);
        
        if (!path) {
          return reply.status(400).send({ error: 'Path parameter is required' });
        }
        
        // Configurer le remote name selon le provider
        this.currentUserEmail = userEmail;
        const remoteName = provider === 'googledrive' 
          ? this.getGoogleDriveRemoteName(userEmail)
          : this.getRemoteName(userEmail);
        
        logger.info(`🔧 Remote name calculé pour ${provider}: "${remoteName}"`);
        
        const remotePath = `${remoteName}:${path}`;
        logger.info('📂 Chemin remote complet: "' + remotePath + '"');
        
        // Utiliser rclone cat pour obtenir le contenu du fichier
        const cmd = `rclone cat "${remotePath}"`;
        logger.info('🔧 Commande rclone à exécuter: "' + cmd + '"');
        
        const { exec } = require('child_process');
        
        return new Promise((resolve, reject) => {
          const child = exec(cmd, { encoding: 'buffer', maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
              logger.error('❌ rclone download command failed:');
              logger.error('❌ Error message: "' + error.message + '"');
              logger.error('❌ Error code: "' + error.code + '"');
              logger.error('❌ Stderrrrrrrrrrrrrrrrrrrr: "' + (stderr?.toString() || 'N/A') + '"');
              logger.error('❌ Command was: "' + cmd + '"');
              reply.status(500).send({ error: 'Download failed', message: error.message, stderr: stderr?.toString() });
              return reject(error);
            }
            
            if (stderr) {
              logger.warn('⚠️ rclone download stderr:', stderr);
            }
            
            logger.info('📤 File downloaded successfully, size:', stdout.length, 'bytes');
            
            // Déterminer le type MIME basé sur l'extension
            const fileName = path.split('/').pop() || 'file';
            const extension = fileName.split('.').pop()?.toLowerCase();
            let contentType = 'application/octet-stream';
            
            switch (extension) {
              case 'png': contentType = 'image/png'; break;
              case 'jpg': case 'jpeg': contentType = 'image/jpeg'; break;
              case 'gif': contentType = 'image/gif'; break;
              case 'pdf': contentType = 'application/pdf'; break;
              case 'txt': contentType = 'text/plain'; break;
              case 'doc': contentType = 'application/msword'; break;
              case 'docx': contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
              case 'mp4': contentType = 'video/mp4'; break;
              case 'mp3': contentType = 'audio/mpeg'; break;
              default: contentType = 'application/octet-stream';
            }
            
            logger.info('📤 Content-Type détecté:', contentType, 'pour le fichier:', fileName);
            
            // Définir les en-têtes appropriés
            reply.header('Content-Type', contentType);
            reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
            
            reply.send(stdout);
            resolve(stdout);
          });
        });
        
      } catch (error) {
        logger.error('❌ Download exception:', error);
        return reply.status(500).send({ error: 'Internal download error', message: error.message });
      }
    });

    // 5) Synchronisation incrémentale avec rclone sync - ENDPOINT UNIFIÉ
    // Phase 1: Analyser l'arborescence cloud (Dropbox/Google Drive) et retourner les dossiers à créer
    fastify.post(`${apiPrefix}/rclone/analyze`, {
      preValidation: fastify.authenticate
    }, async (request: any, reply) => {
      // Increase timeout to 5 minutes for large cloud analysis
      request.raw.socket.setTimeout(300000);
      reply.raw.socket?.setTimeout(300000);
      logger.info('🔍 ANALYZE ENDPOINT CALLED');
      try {
        const { path: cloudPath = '', userEmail, provider = 'dropbox' } = request.body;
        
        if (!userEmail) {
          return reply.status(400).send({ error: 'userEmail is required' });
        }
        
        logger.info(`🔍 Analyzing ${provider.toUpperCase()} structure for user: ${userEmail}`);
        logger.info(`📂 ${provider.toUpperCase()} path: "${cloudPath}"`);
        
        // Configurer l'utilisateur courant
        this.currentUserEmail = userEmail;
        
        // UTILISER LA MÉTHODE UNIFIÉE pour lister récursivement
        const remoteName = provider === 'googledrive' 
          ? this.getGoogleDriveRemoteName(userEmail)
          : this.getRemoteName(userEmail);
        
        // Lister tous les fichiers du cloud provider récursivement
        const listCommand = provider === 'googledrive' 
          ? `rclone lsjson --recursive "${remoteName}:${cloudPath}" --hash`
          : `rclone lsjson --recursive "${remoteName}:${cloudPath}"`;
        logger.info(`📋 Listing files: ${listCommand}`);
        
        const { stdout } = await execAsync(listCommand, { maxBuffer: 100 * 1024 * 1024, timeout: 300000 });
        const files = JSON.parse(stdout).filter((f: any) => !f.IsDir);
        
        // Extraire tous les dossiers nécessaires
        const foldersToCreate = new Set<string>();
        files.forEach((file: any) => {
          const pathParts = file.Path.split('/');
          pathParts.pop(); // Enlever le nom du fichier
          
          // Ajouter chaque niveau de dossier
          let currentPath = '';
          pathParts.forEach(part => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (currentPath) {
              foldersToCreate.add(currentPath);
            }
          });
        });
        
        const foldersArray = Array.from(foldersToCreate).sort();
        
        logger.info(`📁 Found ${foldersArray.length} folders to create:`, foldersArray);
        
        // === DIAGNOSTIC COMPLET (avant synchronisation) ===
        let diagnosticData = null;
        try {
          logger.info('\n🚀 === DIAGNOSTIC: LISTING CONTENT FOR COMPARISON ===');
          
          // 1. LISTER DROPBOX CONTENT
          const allDropboxItems = JSON.parse(stdout);
          const dropboxFolders = allDropboxItems.filter((f: any) => f.IsDir);
          const dropboxAllFiles = allDropboxItems.filter((f: any) => !f.IsDir);
          
          // Filtrer pour ne garder que les fichiers à la racine (pas dans des sous-dossiers)
          const dropboxRootFiles = dropboxAllFiles.filter((f: any) => !f.Path.includes('/'));
          
          // Séparer dossiers de premier niveau et sous-dossiers
          const topLevelFolders = dropboxFolders.filter((f: any) => !f.Path.includes('/'));
          
          // Calculer la taille des dossiers de premier niveau (inclut fichiers récursifs)
          const foldersWithSize = topLevelFolders.map((folder: any) => {
            const folderFiles = dropboxAllFiles.filter((f: any) => f.Path.startsWith(folder.Path + '/'));
            const totalSize = folderFiles.reduce((sum: number, f: any) => sum + f.Size, 0);
            return {
              name: folder.Name,
              path: folder.Path,
              sizeKB: Math.round(totalSize / 1024)
            };
          });
          
          logger.info(`📁 ${provider.toUpperCase()} TOP-LEVEL FOLDERS (${foldersWithSize.length}):`);
          foldersWithSize.forEach((folder: any) => {
            logger.info(`  📁 ${folder.name} - ${folder.sizeKB} KB`);
          });
          logger.info(`📁 Total folders (all levels): ${dropboxFolders.length}`);
          
          logger.info(`📄 DROPBOX FILES (racine uniquement) (${dropboxRootFiles.length}):`);
          dropboxRootFiles.forEach((file: any) => {
            const sizeKB = Math.round(file.Size / 1024);
            logger.info(`  📄 ${file.Path} (${file.Name}) - ${sizeKB} KB`);
          });
          
          // 2. LISTER MYDRIVE CONTENT (si driveParentId fourni)
          const driveParentId = request.body.driveParentId;
          if (driveParentId) {
            logger.info('\n🗂️ === MYDRIVE CONTENT ===');
            
            // Utiliser userId/companyId du frontend (priorité) ou fallback sur request.user / DB
            const frontendUserId = request.body.userId;
            const frontendCompanyId = request.body.companyId;
            const companyId = frontendCompanyId || await this.getCompanyId();
            const userId = frontendUserId || request.user?.id || await this.getUserId();
            const executionContext = {
              company: { id: companyId },
              user: { 
                id: userId,
                email: userEmail,
                server_request: true,
                application_id: null
              }
            };
            logger.info(`🔑 Using company ID: ${executionContext.company.id} (${frontendCompanyId ? 'from frontend' : 'from DB'})`);
            logger.info(`🔑 Using user ID: ${executionContext.user.id} (${frontendUserId ? 'from frontend' : request.user?.id ? 'from request' : 'from DB'})`);
            
            const browseResult = await globalResolver.services.documents.documents.browse(
              driveParentId,
              {},
              executionContext
            );
            
            const myDriveFolders = browseResult.children?.filter((item: any) => item.is_directory) || [];
            const myDriveFiles = browseResult.children?.filter((item: any) => !item.is_directory) || [];
            
            // Calculer la taille des dossiers MyDrive (approximation basée sur les fichiers directs)
            const myDriveFoldersWithSize = myDriveFolders.map((folder: any) => ({
              name: folder.name,
              id: folder.id,
              sizeKB: Math.round((folder.size || 0) / 1024) // Taille du dossier si disponible
            }));
            
            const myDriveRootFiles = myDriveFiles.map((file: any) => ({
              name: file.name,
              id: file.id,
              sizeKB: Math.round((file.size || 0) / 1024)
            }));
            
            logger.info(`📁 MYDRIVE FOLDERS (${myDriveFoldersWithSize.length}):`);
            myDriveFoldersWithSize.forEach((folder: any) => {
              logger.info(`  📁 ${folder.name} - ${folder.sizeKB} KB`);
            });
            
            logger.info(`📄 MYDRIVE FILES (racine uniquement) (${myDriveRootFiles.length}):`);
            myDriveRootFiles.forEach((file: any) => {
              logger.info(`  📄 ${file.name} - ${file.sizeKB} KB`);
            });
            
            // === LOGIQUE DE SYNCHRONISATION CONDITIONNELLE ===
            const TOLERANCE_KB = 1; // Tolérance de ±1KB
            
            // Analyser les dossiers à synchroniser
            const foldersToSync = foldersWithSize.filter((dbFolder: any) => {
              const matchingFolder = myDriveFoldersWithSize.find((mdFolder: any) => 
                mdFolder.name === dbFolder.name // Comparaison stricte
              );
              
              if (!matchingFolder) {
                logger.info(`✅ DOSSIER À SYNC: "${dbFolder.name}" (nouveau, ${dbFolder.sizeKB} KB)`);
                return true; // Nouveau dossier
              }
              
              const sizeDiff = Math.abs(dbFolder.sizeKB - matchingFolder.sizeKB);
              if (sizeDiff > TOLERANCE_KB) {
                logger.info(`✅ DOSSIER À SYNC: "${dbFolder.name}" (taille différente: ${dbFolder.sizeKB} KB vs ${matchingFolder.sizeKB} KB)`);
                return true; // Taille différente
              }
              
              logger.info(`❌ DOSSIER IGNORÉ: "${dbFolder.name}" (identique: ${dbFolder.sizeKB} KB)`);
              return false; // Déjà à jour
            });
            
            // Analyser les fichiers à synchroniser
            const dropboxRootFilesFormatted = dropboxRootFiles.map((f: any) => ({
              name: f.Name,
              sizeKB: Math.round(f.Size / 1024)
            }));
            
            const filesToSync = dropboxRootFilesFormatted.filter((dbFile: any) => {
              const matchingFile = myDriveRootFiles.find((mdFile: any) => 
                mdFile.name === dbFile.name // Comparaison stricte
              );
              
              if (!matchingFile) {
                logger.info(`✅ FICHIER À SYNC: "${dbFile.name}" (nouveau, ${dbFile.sizeKB} KB)`);
                return true; // Nouveau fichier
              }
              
              const sizeDiff = Math.abs(dbFile.sizeKB - matchingFile.sizeKB);
              if (sizeDiff > TOLERANCE_KB) {
                logger.info(`✅ FICHIER À SYNC: "${dbFile.name}" (taille différente: ${dbFile.sizeKB} KB vs ${matchingFile.sizeKB} KB)`);
                return true; // Taille différente
              }
              
              logger.info(`❌ FICHIER IGNORÉ: "${dbFile.name}" (identique: ${dbFile.sizeKB} KB)`);
              return false; // Déjà à jour
            });
            
            // Compter aussi les fichiers dans les dossiers à synchroniser
            const folderFilesToSyncCount = foldersToSync.reduce((count: number, folder: any) => {
              const folderFiles = dropboxAllFiles.filter((f: any) => f.Path.startsWith(folder.path + '/'));
              return count + folderFiles.length;
            }, 0);
            
            const totalFilesToSync = filesToSync.length + folderFilesToSyncCount;
            
            logger.info(`\n📊 RÉSULTAT ANALYSE: ${foldersToSync.length}/${foldersWithSize.length} dossiers à sync, ${filesToSync.length} fichiers racine + ${folderFilesToSyncCount} fichiers dans dossiers = ${totalFilesToSync} fichiers total à sync`);
            
            // Préparer les données pour le frontend
            diagnosticData = {
              dropbox: {
                folders: foldersWithSize,
                files: dropboxRootFilesFormatted,
                totalRecursiveFiles: dropboxAllFiles.length
              },
              myDrive: {
                folders: myDriveFoldersWithSize,
                files: myDriveRootFiles
              },
              toSync: {
                folders: foldersToSync,
                files: filesToSync,
                totalFilesToSync: totalFilesToSync
              }
            };
            
            // 3. COMPARAISON (premier niveau uniquement)
            logger.info('\n🔍 === COMPARISON ANALYSIS (TOP-LEVEL ONLY) ===');
            
            // Comparer les dossiers de premier niveau
            logger.info('📁 FOLDER COMPARISON (top-level):');
            topLevelFolders.forEach((dbFolder: any) => {
              const matchingFolder = myDriveFolders.find((mdFolder: any) => {
                const baseName = dbFolder.Name;
                const pattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-\\d+)?$`);
                return pattern.test(mdFolder.name);
              });
              
              if (matchingFolder) {
                logger.info(`  ✅ MATCH: "${dbFolder.Name}" <-> MyDrive "${matchingFolder.name}"`);
              } else {
                logger.info(`  ❌ MISSING: "${dbFolder.Name}" not found in MyDrive`);
              }
            });
            
            // Comparer les fichiers (racine uniquement)
            logger.info('📄 FILE COMPARISON (racine uniquement):');
            dropboxRootFiles.forEach((dbFile: any) => {
              const matchingFile = myDriveFiles.find((mdFile: any) => {
                const baseName = dbFile.Name.split('.')[0];
                const extension = dbFile.Name.includes('.') ? '.' + dbFile.Name.split('.').pop() : '';
                const pattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-\\d+)?${extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
                
                const nameMatch = pattern.test(mdFile.name);
                const sizeMatch = Math.abs((mdFile.size || 0) - dbFile.Size) < 1024; // Tolérance 1KB
                
                return nameMatch && sizeMatch;
              });
              
              const dbSizeKB = Math.round(dbFile.Size / 1024);
              if (matchingFile) {
                const mdSizeKB = Math.round((matchingFile.size || 0) / 1024);
                logger.info(`  ✅ MATCH: Dropbox "${dbFile.Name}" (${dbSizeKB}KB) <-> MyDrive "${matchingFile.name}" (${mdSizeKB}KB)`);
              } else {
                logger.info(`  ❌ MISSING: Dropbox "${dbFile.Name}" (${dbSizeKB}KB) not found in MyDrive`);
              }
            });
          } else {
            logger.info('⚠️ No driveParentId provided, skipping MyDrive comparison');
          }
          
          logger.info('🏁 === DIAGNOSTIC COMPLETE ===\n');
          
        } catch (diagError) {
          logger.error('❌ Diagnostic logging failed:', diagError);
        }
        // === FIN LOGS DE DIAGNOSTIC ===
        
        return reply.send({
          success: true,
          folders: foldersArray,
          totalFiles: files.length,
          diagnostic: diagnosticData // Données de diagnostic pour le frontend
        });
        
      } catch (error) {
        logger.error('❌ Failed to analyze Dropbox structure:', error);
        return reply.status(500).send({ 
          success: false, 
          error: 'Failed to analyze Dropbox structure',
          details: error.message 
        });
      }
    });
    
    // Phase 2: Synchroniser les fichiers avec la map des dossiers créés (Dropbox et Google Drive)
    fastify.post(`${apiPrefix}/rclone/sync`, {
      preValidation: fastify.authenticate
    }, async (request: any, reply) => {
      // Increase timeout to 10 minutes for large sync operations
      request.raw.socket.setTimeout(600000);
      reply.raw.socket?.setTimeout(600000);
      logger.info('🔄 UNIFIED SYNC ENDPOINT CALLED');
      try {
        const { path: cloudPath = '', userEmail, driveParentId, folderMap = {}, provider = 'dropbox', userId: frontendUserId, companyId: frontendCompanyId } = request.body;
        
        if (!userEmail) {
          return reply.status(400).send({ error: 'userEmail is required' });
        }
        
        if (!driveParentId) {
          return reply.status(400).send({ error: 'driveParentId is required' });
        }
        
        logger.info(`🚀 Starting ${provider.toUpperCase()} sync for user: ${userEmail}`);
        logger.info(`📂 ${provider.toUpperCase()} path: "${cloudPath}", Drive parent: "${driveParentId}"`);
        logger.info(`📁 Folder map:`, folderMap);
        
        // Utiliser userId/companyId du frontend (priorité) ou fallback sur request.user / DB
        const companyId = frontendCompanyId || await this.getCompanyId();
        const userId = frontendUserId || request.user?.id || await this.getUserId();
        logger.info(`🔑 Using company ID: ${companyId} (${frontendCompanyId ? 'from frontend' : 'from DB'})`);
        logger.info(`🔑 Using user ID: ${userId} (${frontendUserId ? 'from frontend' : request.user?.id ? 'from request' : 'from DB'})`);
        const executionContext = {
          company: { id: companyId },
          user: { 
            id: userId,
            email: userEmail,
            server_request: true,
            application_id: null
          },
          url: '/api/v1/rclone/sync',
          method: 'POST',
          reqId: 'rclone-sync',
          transport: 'http' as const,
        };
        this.currentUserEmail = userEmail;
        let remoteName: string;
        
        if (provider === 'googledrive') {
          remoteName = this.getGoogleDriveRemoteName(userEmail);
        } else {
          remoteName = this.getRemoteName(userEmail); // Dropbox
        }
        
        // 1. LISTER CLOUD CONTENT (Dropbox ou Google Drive)
        const remotePath = `${remoteName}:${cloudPath}`;
        const listCommand = `rclone lsjson --recursive "${remotePath}"`;
        
        const { stdout } = await execAsync(listCommand, { maxBuffer: 100 * 1024 * 1024, timeout: 300000 });
        const allCloudItems = JSON.parse(stdout);
        const cloudFolders = allCloudItems.filter((f: any) => f.IsDir);
        const cloudAllFiles = allCloudItems.filter((f: any) => !f.IsDir);
        
        // Filtrer pour ne garder que les fichiers à la racine (pas dans des sous-dossiers)
        const cloudRootFiles = cloudAllFiles.filter((f: any) => !f.Path.includes('/'));
        
        // Séparer dossiers de premier niveau et sous-dossiers
        const topLevelCloudFolders = cloudFolders.filter((f: any) => !f.Path.includes('/'));
        
        // Calculer la taille des dossiers de premier niveau (inclut fichiers récursifs)
        const foldersWithSize = topLevelCloudFolders.map((folder: any) => {
          const folderFiles = cloudAllFiles.filter((f: any) => f.Path.startsWith(folder.Path + '/'));
          const totalSize = folderFiles.reduce((sum: number, f: any) => sum + f.Size, 0);
          return {
            name: folder.Name,
            path: folder.Path,
            sizeKB: Math.round(totalSize / 1024)
          };
        });
        
        logger.info(`📁 TOP-LEVEL CLOUD FOLDERS: ${foldersWithSize.length} (total all levels: ${cloudFolders.length})`);
        
        // 2. LISTER MYDRIVE CONTENT
        const browseResult = await globalResolver.services.documents.documents.browse(
          driveParentId,
          {},
          executionContext
        );
        
        const myDriveFolders = browseResult.children?.filter((item: any) => item.is_directory) || [];
        const myDriveFiles = browseResult.children?.filter((item: any) => !item.is_directory) || [];
        
        const myDriveFoldersWithSize = myDriveFolders.map((folder: any) => ({
          name: folder.name,
          id: folder.id,
          sizeKB: Math.round((folder.size || 0) / 1024)
        }));
        
        const myDriveRootFiles = myDriveFiles.map((file: any) => ({
          name: file.name,
          id: file.id,
          sizeKB: Math.round((file.size || 0) / 1024)
        }));
        
        // 3. APPLIQUER LA LOGIQUE CONDITIONNELLE
        const TOLERANCE_KB = 1; // Tolérance de ±1KB
        
        // Filtrer les fichiers à synchroniser
        const cloudRootFilesFormatted = cloudRootFiles.map((f: any) => ({
          name: f.Name,
          path: f.Path,
          sizeKB: Math.round(f.Size / 1024)
        }));
        
        // Analyser les dossiers à synchroniser
        const foldersToSync = foldersWithSize.filter((dbFolder: any) => {
          const matchingFolder = myDriveFoldersWithSize.find((mdFolder: any) => 
            mdFolder.name === dbFolder.name // Comparaison stricte
          );
          
          if (!matchingFolder) {
            logger.info(`✅ DOSSIER À SYNC: "${dbFolder.name}" (nouveau, ${dbFolder.sizeKB} KB)`);
            return true; // Nouveau dossier
          }
          
          const sizeDiff = Math.abs(dbFolder.sizeKB - matchingFolder.sizeKB);
          if (sizeDiff > TOLERANCE_KB) {
            logger.info(`✅ DOSSIER À SYNC: "${dbFolder.name}" (taille différente: ${dbFolder.sizeKB} KB vs ${matchingFolder.sizeKB} KB)`);
            return true; // Taille différente
          }
          
          logger.info(`❌ DOSSIER IGNORÉ: "${dbFolder.name}" (identique: ${dbFolder.sizeKB} KB)`);
          return false; // Déjà à jour
        });
        
        // Analyser les fichiers racine à synchroniser
        const rootFilesToSync = cloudRootFilesFormatted.filter((dbFile: any) => {
          const matchingFile = myDriveRootFiles.find((mdFile: any) => 
            mdFile.name === dbFile.name // Comparaison stricte
          );
          
          if (!matchingFile) {
            logger.info(`✅ FICHIER RACINE À SYNC: "${dbFile.name}" (nouveau, ${dbFile.sizeKB} KB)`);
            return true; // Nouveau fichier
          }
          
          const sizeDiff = Math.abs(dbFile.sizeKB - matchingFile.sizeKB);
          if (sizeDiff > TOLERANCE_KB) {
            logger.info(`✅ FICHIER RACINE À SYNC: "${dbFile.name}" (taille différente: ${dbFile.sizeKB} KB vs ${matchingFile.sizeKB} KB)`);
            return true; // Taille différente
          }
          
          logger.info(`❌ FICHIER RACINE IGNORÉ: "${dbFile.name}" (identique: ${dbFile.sizeKB} KB)`);
          return false; // Déjà à jour
        });
        
        // Ajouter tous les fichiers des dossiers à synchroniser
        const folderFilesToSync: any[] = [];
        for (const folder of foldersToSync) {
          const folderFiles = cloudAllFiles.filter((f: any) => f.Path.startsWith(folder.path + '/'));
          folderFiles.forEach((file: any) => {
            folderFilesToSync.push({
              name: file.Name,
              path: file.Path,
              sizeKB: Math.round(file.Size / 1024)
            });
            logger.info(`✅ FICHIER DOSSIER À SYNC: "${file.Path}" (dans dossier ${folder.name})`);
          });
        }
        
        // Combiner tous les fichiers à synchroniser
        const allFilesToSync = [...rootFilesToSync, ...folderFilesToSync];
        
        logger.info(`\n📊 SYNC CONDITIONNEL: ${allFilesToSync.length} fichiers à synchroniser (${rootFilesToSync.length} racine + ${folderFilesToSync.length} dans dossiers)`);
        
        // Si aucun fichier à synchroniser, retourner directement
        if (allFilesToSync.length === 0) {
          logger.info('ℹ️ Aucun fichier à synchroniser (tout est à jour)');
          return reply.send({
            success: true,
            message: 'Aucun fichier à synchroniser - tout est à jour',
            filesProcessed: 0
          });
        }
        
        // UTILISER LA MÉTHODE UNIFIÉE pour synchroniser selon le provider
        const result = await this.syncCloudWithFolderMap(
          cloudPath, 
          driveParentId, 
          userEmail, 
          executionContext, 
          folderMap, 
          provider as 'dropbox' | 'googledrive',
          allFilesToSync // Fichiers filtrés (optionnel)
        );
        
        logger.info(`✅ Sync completed: ${result.message}`);
        return reply.send({
          success: true,
          message: result.message,
          filesProcessed: result.filesProcessed
        });
        
      } catch (error) {
        logger.error('❌ Sync exception:', error);
        return reply.status(500).send({ 
          error: 'Sync failed', 
          message: error.message 
        });
      }
    });
    
    // ========== GOOGLE DRIVE ROUTES ==========
    
    // 1) Generate AuthUrl for Google Drive OAuth
    fastify.get(`${apiPrefix}/drivers/GoogleDrive`, async (request: any, reply) => {
      // Récupérer l'email utilisateur depuis les query parameters
      const userEmail = request.query.userEmail as string || 'default@user.com';
      logger.info('📧 Email utilisateur reçu pour Google Drive:', userEmail);
      
      // Mettre à jour le remote pour cet utilisateur
      this.currentUserEmail = userEmail;
      const googleDriveRemoteName = this.getGoogleDriveRemoteName(userEmail);
      logger.info('🔧 Google Drive Remote name mis à jour:', googleDriveRemoteName);
      
      const authUrl = await this.getGoogleDriveAuthUrl(request);
      logger.info('→ Google Drive AuthUrl generated:', authUrl);
      // Important: Format exact attendu par le frontend
      return reply.send({ addition: { AuthUrl: authUrl } });
    });
    
    // 2) OAuth callback for Google Drive - DÉSACTIVÉ car géré par le service OAuth centralisé
    /*
    fastify.get(`${apiPrefix}/recover/GoogleDrive`, async (request: any, reply) => {
      const fullUrl = `${request.protocol}://${request.hostname}${request.url}`;
      logger.info('🔔 Google Drive Callback received:', fullUrl);

      const code = request.query.code as string | undefined;
      if (!code) {
        return reply.status(400).send('❌ Missing code for Google Drive');
      }

      const stateParam = request.query.state as string | undefined;
      let effectiveUserEmail: string | undefined;
      if (stateParam) {
        try {
          // Le paramètre state peut être encodé plusieurs fois selon le proxy / la redirection
          let decodedState = stateParam;
          for (let i = 0; i < 2; i++) {
            try {
              decodedState = decodeURIComponent(decodedState);
            } catch {
              break;
            }
          }
          if (decodedState.startsWith('{')) {
            const parsed = JSON.parse(decodedState);
            if (parsed && typeof parsed.userEmail === 'string' && parsed.userEmail) {
              effectiveUserEmail = parsed.userEmail;
            }
          }
        } catch {
          // ignore
        }
      }
      effectiveUserEmail = effectiveUserEmail || this.currentUserEmail || 'default@user.com';

      // LEGACY CODE - Not used anymore with centralized OAuth service
      const params = new URLSearchParams({
        code: code,
        grant_type: 'authorization_code',
        client_id: 'legacy',
        client_secret: 'legacy',
        redirect_uri: 'legacy'
      });

      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        });
        
        const tokenJson = await tokenRes.json();
        if (!tokenRes.ok) {
          logger.error('Google Drive Token error:', tokenJson);
          return reply.status(500).send('Google Drive Token exchange failed');
        }

        // Create rclone remote pour Google Drive
        const remoteName = this.getGoogleDriveRemoteName(effectiveUserEmail);
        
        const tokenForRclone = JSON.stringify({
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expiry: tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : undefined
        });
        
        // Créer le remote Google Drive avec rclone
        const configPath = '/root/.config/rclone/rclone.conf';
        const deleteCmd = `rclone --config ${configPath} config delete ${remoteName} 2>/dev/null || true`;
        const createCmd = `rclone --config ${configPath} config create ${remoteName} drive token '${tokenForRclone}' --non-interactive`;

        try {
          await execAsync(`${deleteCmd} && ${createCmd}`);
          logger.info(`✅ Google Drive Remote "${remoteName}" created in rclone.conf`);
        } catch (err: any) {
          logger.error('Google Drive rclone config failed:', { error: err?.message });
          return reply.status(500).send('Google Drive rclone config failed');
        }

        // Redirection automatique vers rdrive après authentification réussie
        // 1) Priorité: en-têtes X-Forwarded-* fournis par Nginx (préservent le port)
        let redirectUrl: string;
        const gXfProtoHeader = request.headers?.['x-forwarded-proto'] as string | undefined;
        const gXfHostHeader = request.headers?.['x-forwarded-host'] as string | undefined;
        const gXfProto = gXfProtoHeader ? gXfProtoHeader.split(',')[0].trim() : undefined;
        const gXfHost = gXfHostHeader ? gXfHostHeader.split(',')[0].trim() : undefined;
        if (gXfProto && gXfHost) {
          redirectUrl = `${gXfProto}://${gXfHost}/client`;
          logger.info(`Redirection via X-Forwarded headers (GDrive): ${redirectUrl}`);
        }
        
        // 2) Fallback: Origin
        if (!redirectUrl) {
          const origin = request.headers.origin as string | undefined;
          if (origin) {
            redirectUrl = `${origin}/client`;
            logger.info(`Redirection via Origin (GDrive): ${redirectUrl}`);
          }
        }
        
        // 3) Fallback: Referer
        if (!redirectUrl) {
          try {
            const referer = request.headers.referer as string | undefined;
            if (referer) {
              const refererUrl = new URL(referer);
              const port = refererUrl.port;
              const hostWithPort = port ? `${refererUrl.hostname}:${port}` : refererUrl.hostname;
              redirectUrl = `${refererUrl.protocol}//${hostWithPort}/client`;
              logger.info(`Redirection via Referer (GDrive): ${redirectUrl}`);
            }
          } catch (e) {
            logger.info(`Erreur lors du parsing du Referer (GDrive): ${e.message}`);
          }
        }
        
        // 4) Fallback final: Host + protocol de la requête
        if (!redirectUrl) {
          const reqHost = request.headers.host || request.hostname;
          const reqProto = (request.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || request.protocol || 'http';
          redirectUrl = `${reqProto}://${reqHost}/client`;
          logger.info(`Fallback final (GDrive): ${redirectUrl}`);
        }
        
        logger.info(`🔀 Redirecting to rdrive: ${redirectUrl}`);
        
        // Envoyer une page HTML avec redirection automatique
        const htmlResponse = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Google Drive Authentication Successful</title>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
              .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
              .success { color: #28a745; font-size: 18px; margin-bottom: 20px; }
              .redirect { color: #6c757d; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅ Google Drive Authentication Successful!</div>
              <div class="redirect">Redirecting to rdrive...</div>
            </div>
            <script>
              // Redirection automatique après 2 secondes avec rechargement forcé
              setTimeout(() => {
                // Forcer un rechargement complet avec vidage du cache
                // Ajouter un timestamp pour forcer le reload
                const url = '${redirectUrl}' + (('${redirectUrl}'.includes('?')) ? '&' : '?') + '_reload=' + Date.now();
                window.location.href = url;
                // Alternative: forcer un hard reload si supporté
                if (window.location.reload) {
                  setTimeout(() => window.location.reload(true), 100);
                }
              }, 2000);
            </script>
          </body>
          </html>
        `;
        
        return reply.type('text/html').send(htmlResponse);
      } catch (error) {
        logger.error('Google Drive Exchange error:', error);
        return reply.status(500).send('Internal Google Drive OAuth error');
      }
    });
    */
    
    // Note: Google Drive sync now uses the unified /api/v1/rclone/sync endpoint with provider=googledrive

  }
  
  /**
   * Crée récursivement tous les dossiers Google Drive dans Twake Drive
   * Phase 1 de la synchronisation en 2 temps
   */
  private async createGoogleDriveFoldersRecursively(
    googleDrivePath: string,
    driveParentId: string,
    userEmail: string,
    executionContext: any
  ): Promise<Record<string, string>> {
    
    // Mettre à jour le remote pour cet utilisateur
    const googleDriveRemoteName = this.getGoogleDriveRemoteName(userEmail);
    logger.info(`🔧 Using Google Drive remote: ${googleDriveRemoteName}`);
    
    const folderMap: Record<string, string> = {};
    folderMap[''] = driveParentId; // Racine
    
    try {
      // Lister tous les dossiers Google Drive récursivement
      const remotePath = `${googleDriveRemoteName}:${googleDrivePath}`;
      const cmd = `rclone lsjson "${remotePath}" --recursive --dirs-only`;
      
      logger.info('📁 Listing Google Drive folders recursively:', cmd);
      
      const result = await new Promise<string>((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            logger.error('❌ Google Drive folder listing failed:', { error: error.message, stderr });
            reject(error);
            return;
          }
          resolve(stdout);
        });
      });
      
      const folders = JSON.parse(result || '[]');
      logger.info(`📂 Found ${folders.length} Google Drive folders`);
      
      // Trier les dossiers par profondeur (parents avant enfants)
      folders.sort((a: any, b: any) => {
        const depthA = (a.Path || '').split('/').length;
        const depthB = (b.Path || '').split('/').length;
        return depthA - depthB;
      });
      
      // Créer chaque dossier dans Twake Drive
      for (const folder of folders) {
        const folderPath = folder.Path || '';
        const folderName = folder.Name || '';
        
        // Déterminer le parent
        const parentPath = path.dirname(folderPath);
        const parentId = parentPath === '.' ? driveParentId : folderMap[parentPath];
        
        if (!parentId) {
          logger.warn(`⚠️ Parent not found for folder ${folderPath}, skipping`);
          continue;
        }
        
        try {
          // Créer le dossier dans Twake Drive
          const driveItemData = {
            name: folderName,
            parent_id: parentId,
            is_directory: true,
            scope: 'personal'
          } as any; // Cast entire object to avoid type error
          
          const driveItem = await globalResolver.services.documents.documents.create(
            driveItemData,
            null,
            executionContext,
            null // Add missing 4th parameter
          );
          
          folderMap[folderPath] = driveItem.id;
          logger.info(`✅ Created Google Drive folder: ${folderName} (${driveItem.id})`);
          
        } catch (error) {
          logger.error(`❌ Failed to create Google Drive folder ${folderName}:`, error);
        }
      }
      
      return folderMap;
      
    } catch (error) {
      logger.error('❌ Google Drive folder creation failed:', error);
      return folderMap;
    }
  }

  /**
   * Synchronisation Google Drive vers Twake Drive avec map des dossiers préalablement créés
   * Phase 2 de la synchronisation en 2 temps - UTILISE LA MÉTHODE UNIFIÉE
   */
  private async syncGoogleDriveWithFolderMap(
    googleDrivePath: string,
    driveParentId: string,
    userEmail: string,
    executionContext: any,
    folderMap: Record<string, string>, // Map: chemin dossier -> ID dossier Twake
    filesToSync?: any[] // Liste optionnelle de fichiers filtrés à synchroniser
  ): Promise<{ success: boolean; message: string; filesProcessed: number }> {
    // UTILISER LA MÉTHODE UNIFIÉE POUR GOOGLE DRIVE
    return await this.syncCloudWithFolderMap(
      googleDrivePath,
      driveParentId,
      userEmail,
      executionContext,
      folderMap,
      'googledrive',
      filesToSync
    );
  }

  /**
   * Synchronisation cloud unifiée (Dropbox/Google Drive) vers Twake Drive avec map des dossiers préalablement créés
   * Phase 2 de la synchronisation en 2 temps - REMPLACE syncDropboxWithFolderMap ET syncGoogleDriveWithFolderMap
   */
  private async syncCloudWithFolderMap(
    cloudPath: string,
    driveParentId: string,
    userEmail: string,
    executionContext: any,
    folderMap: Record<string, string>, // Map: chemin dossier -> ID dossier Twake
    provider: 'dropbox' | 'googledrive',
    filesToSync?: any[] // Liste optionnelle de fichiers filtrés à synchroniser
  ): Promise<{ success: boolean; message: string; filesProcessed: number }> {
    
    // Mettre à jour le remote pour cet utilisateur selon le provider
    this.currentUserEmail = userEmail;
    const remoteName = provider === 'googledrive' 
      ? this.getGoogleDriveRemoteName(userEmail)
      : this.getRemoteName(userEmail);
    this.REMOTE_NAME = remoteName;
    
    logger.info(`🔧 Using ${provider} remote: ${remoteName}`);
    
    try {
      // 1. Lister tous les fichiers cloud récursivement
      let files: any[];
      
      if (filesToSync && filesToSync.length > 0) {
        // Utiliser les fichiers filtrés passés en paramètre
        logger.info(`📋 Using filtered files list: ${filesToSync.length} files`);
        files = filesToSync.map((f: any) => ({
          Path: f.path || f.name, // Utiliser le path ou le nom
          Name: f.name,
          Size: f.sizeKB ? f.sizeKB * 1024 : f.Size || 0 // Convertir KB en bytes si nécessaire
        }));
      } else {
        // Lister tous les fichiers cloud récursivement (comportement par défaut)
        const remotePath = `${remoteName}:${cloudPath}`;
        // Ajouter --hash pour Google Drive pour obtenir plus d'informations sur les fichiers
        const listCommand = provider === 'googledrive' 
          ? `rclone lsjson --recursive "${remotePath}" --hash`
          : `rclone lsjson --recursive "${remotePath}"`;
        
        logger.info(`📋 Listing ${provider} files: ${listCommand}`);
        
        const { stdout } = await execAsync(listCommand, { maxBuffer: 100 * 1024 * 1024, timeout: 300000 });
        const allItems = JSON.parse(stdout);
        files = allItems.filter((f: any) => !f.IsDir);
      }
      
      logger.info(`📂 Found ${files.length} ${provider} files to sync`);
      
      let processedCount = 0;
      let errorCount = 0;
      
      // 2. Traiter les fichiers par batch (UTILISE LA LOGIQUE DROPBOX QUI FONCTIONNE)
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (file: any) => {
            const filePath = cloudPath ? `${cloudPath}/${file.Path}` : file.Path;
            
            // Déterminer le dossier parent correct
            const fileDir = file.Path.includes('/') ? file.Path.substring(0, file.Path.lastIndexOf('/')) : '';
            const targetParentId = fileDir && folderMap[fileDir] ? folderMap[fileDir] : driveParentId;
            
            logger.debug(`📁 File ${file.Path} -> Parent: ${targetParentId} (dir: ${fileDir})`);
            
            // UTILISER LA MÉTHODE UNIFIÉE QUI FONCTIONNE
            return await this.syncSingleCloudFileByStream(filePath, file.Path, targetParentId, executionContext, provider, remoteName);
          })
        );
        
        // Compter les résultats
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            processedCount++;
            logger.debug(`✅ Synced: ${batch[index].Path}`);
          } else {
            errorCount++;
            logger.error(`❌ Failed to sync ${batch[index].Path}:`, result.reason);
          }
        });
        
        // Petit délai entre les batchs pour éviter la surcharge
        if (i + batchSize < files.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const message = `Sync completed: ${processedCount} files processed, ${errorCount} errors`;
      logger.info(`✅ ${message}`);
      
      return {
        success: errorCount === 0,
        message,
        filesProcessed: processedCount
      };
      
    } catch (error) {
      logger.error(`❌ ${provider} sync failed:`, error);
      return {
        success: false,
        message: `Sync failed: ${error.message}`,
        filesProcessed: 0
      };
    }
  }
  
  /**
   * Méthode unifiée pour synchroniser un fichier cloud (Dropbox/Google Drive) vers Twake Drive
   * Utilise la logique Dropbox qui fonctionne comme référence
   */
  private async syncSingleCloudFileByStream(
    cloudFilePath: string,
    fileName: string,
    driveParentId: string,
    executionContext: any,
    provider: 'dropbox' | 'googledrive',
    remoteName: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const remotePath = `${remoteName}:${cloudFilePath}`;
      logger.debug(`🔄 Streaming ${fileName} from ${remotePath} (${provider})`);
      
      const rcloneProcess = spawn('rclone', ['cat', remotePath]);
      const chunks: Buffer[] = [];
      let totalSize = 0;
      
      rcloneProcess.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });
      
      rcloneProcess.stderr.on('data', (data: Buffer) => {
        logger.error(`❌ rclone stderr for ${fileName}:`, data.toString());
      });
      
      rcloneProcess.on('close', async (code: number) => {
        if (code !== 0) {
          reject(new Error(`rclone cat failed with code ${code} for ${fileName}`));
          return;
        }
        
        try {
          // Combiner tous les chunks en un seul buffer
          const fileBuffer = Buffer.concat(chunks);
          
          // Déterminer le type MIME
          const mimeType = this.getMimeType(fileName);
          
          // Extraire le nom du fichier sans le chemin
          const actualFileName = cloudFilePath.split('/').pop() || fileName;
          
          // Sauvegarder vers Twake Drive directement dans le dossier parent spécifié
          // UTILISER LA MÉTHODE DROPBOX QUI FONCTIONNE
          await this.saveStreamToTwakeDrive(fileBuffer, actualFileName, mimeType, driveParentId, executionContext);
          
          logger.debug(`✅ Streamed ${fileName} (${totalSize} bytes) to Twake Drive via ${provider}`);
          resolve();
          
        } catch (error) {
          logger.error(`❌ Failed to save ${fileName} to Twake Drive:`, error);
          reject(error);
        }
      });
      
      rcloneProcess.on('error', (error) => {
        logger.error(`❌ rclone process error for ${fileName}:`, error);
        reject(error);
      });
    });
  }
}
