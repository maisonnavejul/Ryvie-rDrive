import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OAuthService } from './service';
import { logger } from '../../core/platform/framework/logger';
import {
  OAuthConfigDto,
  OAuthCallbackDto,
  OAuthAuthorizeResponse,
  LogoutResponseDto,
  AuthType,
} from './types';

export class OAuthController {
  private service: OAuthService;
  private logger = logger;

  constructor() {
    this.service = new OAuthService();
  }

  registerRoutes(fastify: FastifyInstance, prefix: string = '/api/v1/oauth') {
    fastify.get(`${prefix}/authorize`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as any;
        const dto: OAuthConfigDto = {
          redirectUri: query.redirectUri || query.redirect_uri,
          state: query.state,
          codeChallenge: query.codeChallenge || query.code_challenge,
        };

        if (!dto.redirectUri) {
          return reply.status(400).send({ error: 'redirectUri is required' });
        }

        const result: OAuthAuthorizeResponse = await this.service.authorize(dto);
        
        return reply.send(result);
      } catch (error: any) {
        this.logger.error(`OAuth authorize error: ${error.message}`, error?.stack);
        return reply.status(500).send({ error: error.message });
      }
    });

    fastify.get(`${prefix}/callback`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as any;
        
        // Reconstruire l'URL du callback avec /oauth-callback (la page frontend)
        // car c'est cette URL qui a été envoyée à Keycloak comme redirect_uri.
        // host : l'hôte PUBLIC de l'app, via X-Forwarded-Host (nginx ne réécrit pas Host vers node).
        const host =
          (request.headers['x-forwarded-host'] as string) || request.headers.host || request.hostname;
        // scheme : celui de l'iss (= scheme d'accès navigateur : https en public, http en LAN),
        //          sinon X-Forwarded-Proto, sinon request.protocol.
        let proto =
          ((request.headers['x-forwarded-proto'] as string) || '').split(',')[0].trim() ||
          request.protocol;
        if (query.iss) {
          try {
            proto = new URL(decodeURIComponent(query.iss)).protocol.replace(':', '');
          } catch (e) {
            this.logger.warn(`Failed to parse iss parameter: ${query.iss}`);
          }
        }

        // Reconstruire l'URL avec /oauth-callback (la PAGE frontend = redirect_uri de l'authorize)
        // au lieu de /api/v1/oauth/callback, pour que le redirect_uri du token-exchange corresponde.
        const queryString = request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : '';
        const fullUrl = `${proto}://${host}/oauth-callback${queryString}`;
        this.logger.debug(`Full callback URL (with frontend path): ${fullUrl}`);

        const dto: OAuthCallbackDto = {
          url: fullUrl,
          state: query.state,
          codeVerifier: query.codeVerifier || query.code_verifier,
        };

        const profile = await this.service.callback(dto);

        this.logger.info(`OAuth callback successful for user: ${profile.email}`);

        // Créer ou récupérer l'utilisateur et générer un JWT
        const accessToken = await this.service.createOrUpdateUser(profile);
        
        this.logger.debug(`JWT generated for user ${profile.email}`);

        // Retourner le token en JSON comme le fait le login LDAP
        // Le frontend gérera le token via AuthService.onNewToken()
        return reply.send({ 
          statusCode: '200',
          access_token: accessToken 
        });
      } catch (error: any) {
        this.logger.error(`OAuth callback error: ${error.message}`, error?.stack);
        return reply.status(500).send({ error: error.message });
      }
    });

    fastify.post(`${prefix}/logout`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const authType = (body.authType as AuthType) || AuthType.OAuth;

        const result: LogoutResponseDto = await this.service.logout(authType, request);

        if (result.redirectUri && result.redirectUri !== '/login') {
          return reply.redirect(result.redirectUri);
        }

        return reply.send(result);
      } catch (error: any) {
        this.logger.error(`OAuth logout error: ${error.message}`, error?.stack);
        return reply.status(500).send({ error: error.message });
      }
    });

    fastify.get(`${prefix}/config`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { getOAuthConfig } = await import('./config');
        const config = getOAuthConfig();

        return reply.send({
          enabled: config.enabled,
          buttonText: config.buttonText,
          autoLaunch: config.autoLaunch,
          issuerUrl: config.issuerUrl,
        });
      } catch (error: any) {
        this.logger.error(`OAuth config error: ${error.message}`, error?.stack);
        return reply.status(500).send({ error: error.message });
      }
    });

    this.logger.info(`OAuth routes registered at ${prefix}`);
  }
}
