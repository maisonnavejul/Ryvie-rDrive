import { TdriveService, logger, ServiceName, Prefix, Consumes } from "../../core/platform/framework";
import WebServerAPI from "../../core/platform/services/webserver/provider";
import { FastifyInstance } from "fastify";
import { RcloneAPI } from "./api";
import { exec } from 'child_process';
import fetch from 'node-fetch';

@ServiceName("rclone")
@Prefix("/api/v1")
export default class RcloneService extends TdriveService<RcloneAPI> implements RcloneAPI {
  version = "1";
  name = "rclone";
  
  // Configuration
  private REMOTE_NAME = 'test4';
  private PROXY = process.env.OAUTH_PROXY || 'https://cloudoauth.files.ryvie.fr';
  private DROPBOX_APPKEY = '4b5q5772012fqnf';
  private DROPBOX_APPSECRET = 'obtjnollfq4j5ck';

  constructor() {
    super();
    logger.info("Initializing Rclone service");
  }

  api(): RcloneAPI {
    return this;
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
  
  async getAuthUrl(request?: any): Promise<string> {
    const redirectUri = encodeURIComponent(this.PROXY);
    
    // Générer l'URL de callback dynamiquement comme dans le code Express
    let callbackBase = '/v1/recover/Dropbox';
    if (request) {
      const protocol = request.protocol || 'http';
      const host = request.headers.host || 'localhost:4000';
      callbackBase = `${protocol}://${host}/v1/recover/Dropbox`;
    }
    
    const state = encodeURIComponent(callbackBase);
    const scope = encodeURIComponent([
      'files.metadata.write',
      'files.content.write',
      'files.content.read',
      'sharing.write',
      'account_info.read'
    ].join(' '));

    const authUrl = [
      'https://www.dropbox.com/1/oauth2/authorize',
      `client_id=${this.DROPBOX_APPKEY}`,
      `redirect_uri=${redirectUri}`,
      'response_type=code',
      `scope=${scope}`,
      `state=${state}`,
      'token_access_type=offline'
    ].join('&').replace('authorize&', 'authorize?');

    logger.info('→ AuthUrl generated:', authUrl);
    return authUrl;
  }

  async listFiles(path: string): Promise<any[]> {
    // Implémentation simple pour l'instant
    // Dans une version complète, nous utiliserions l'authentification et les tokens stockés
    logger.info(`Listing files at path: ${path}`);
    return [];
  }
  
  private registerRoutes(fastify: any): void {
    // Register routes
    const apiPrefix = "/api/v1";
    
    // 1) Generate AuthUrl for Dropbox OAuth
    // Le frontend appelle /v1/drivers/Dropbox (sans le préfixe api)
    fastify.get(`/v1/drivers/Dropbox`, async (request: any, reply) => {
      const authUrl = await this.getAuthUrl(request);
      logger.info('→ AuthUrl generated:', authUrl);
      // Important: Format exact attendu par le frontend
      // Pas de .type() pour laisser Fastify définir correctement l'en-tête Content-Type
      return reply.send({ addition: { AuthUrl: authUrl } });

    });
    
    // 2) OAuth callback
    // Le frontend s'attend à recevoir une redirection vers cette route
    fastify.get(`/v1/recover/Dropbox`, async (request: any, reply) => {
      const fullUrl = `${request.protocol}://${request.hostname}${request.url}`;
      logger.info('🔔 Callback received:', fullUrl);

      const code = request.query.code as string | undefined;
      if (!code) {
        return reply.status(400).send('❌ Missing code');
      }

      const params = new URLSearchParams({
        code: code,
        grant_type: 'authorization_code',
        client_id: this.DROPBOX_APPKEY,
        client_secret: this.DROPBOX_APPSECRET,
        redirect_uri: this.PROXY
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

        return reply.send('✅ Authentication successful! You may close this window.');
      } catch (error) {
        logger.error('Exchange error:', error);
        return reply.status(500).send('Internal OAuth error');
      }
    });
    
    // 3) List files - cette route peut garder le préfixe api car elle est appelée par le backend
    fastify.get(`${apiPrefix}/files/rclone/list`, async (request: any, reply) => {
      try {
        const path = (request.query.path as string) || '';
        const files = await this.listFiles(path);
        return reply.send(files);
      } catch (error) {
        logger.error('Listing exception:', error);
        return reply.status(500).send({ error: 'Internal listing error' });
      }
    });
    
  }
}
