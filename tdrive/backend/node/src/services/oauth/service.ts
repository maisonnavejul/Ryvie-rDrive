import { logger } from '../../core/platform/framework/logger';
import { OAuthRepository } from './repository';
import { getOAuthConfig } from './config';
import {
  OAuthConfig,
  OAuthConfigDto,
  OAuthCallbackDto,
  OAuthAuthorizeResponse,
  OAuthProfile,
  LogoutResponseDto,
  AuthType,
} from './types';
import { randomBytes } from 'crypto';

const LOGIN_URL = '/login';

export class OAuthService {
  private logger = logger;
  private repository: OAuthRepository;

  constructor() {
    this.repository = new OAuthRepository();
  }

  async authorize(dto: OAuthConfigDto): Promise<OAuthAuthorizeResponse> {
    const oauth = getOAuthConfig();

    if (!oauth.enabled) {
      throw new Error('OAuth is not enabled');
    }

    const dynamicOauth = { ...oauth };
    try {
      const redirectUrl = new URL(dto.redirectUri);
      dynamicOauth.issuerUrl = this.buildIssuerUrl(oauth.issuerUrl, redirectUrl.hostname);
      this.logger.debug(`Using dynamic issuerUrl for authorize: ${dynamicOauth.issuerUrl}`);
    } catch (error: any) {
      this.logger.warn(`Invalid redirectUri, using default issuerUrl: ${error.message}`);
    }

    const state = dto.state || this.generateState();
    const authUrl = await this.repository.authorize(
      dynamicOauth,
      dto.redirectUri,
      state,
      dto.codeChallenge,
    );

    return { url: authUrl };
  }

  async callback(dto: OAuthCallbackDto): Promise<OAuthProfile> {
    const oauth = getOAuthConfig();

    if (!oauth.enabled) {
      throw new Error('OAuth is not enabled');
    }

    const dynamicOauth = { ...oauth };
    try {
      const callbackUrl = new URL(dto.url);
      const params = callbackUrl.searchParams;

      if (params.get('iss')) {
        const issUrl = new URL(params.get('iss')!);
        dynamicOauth.issuerUrl = this.buildIssuerUrl(oauth.issuerUrl, issUrl.hostname);
        this.logger.debug(`Using dynamic issuerUrl from iss parameter: ${dynamicOauth.issuerUrl}`);
      } else {
        dynamicOauth.issuerUrl = this.buildIssuerUrl(oauth.issuerUrl, callbackUrl.hostname);
        this.logger.debug(`Using dynamic issuerUrl from callback URL: ${dynamicOauth.issuerUrl}`);
      }
    } catch (error: any) {
      this.logger.warn(`Invalid callback URL, using default issuerUrl: ${error.message}`);
    }

    const expectedState = dto.state || '';
    const profile = await this.repository.getProfile(
      dynamicOauth,
      dto.url,
      expectedState,
      dto.codeVerifier,
    );

    return profile;
  }

  async createOrUpdateUser(profile: OAuthProfile): Promise<any> {
    const gr = require('../../services/global-resolver').default;
    
    // Chercher l'utilisateur par email
    let user = await gr.services.users.getByEmail(profile.email);
    
    if (!user) {
      // Créer un nouvel utilisateur
      this.logger.info(`Creating new user from OAuth profile: ${profile.email}`);
      
      const newUser = {
        first_name: profile.given_name || profile.name?.split(' ')[0] || '',
        last_name: profile.family_name || profile.name?.split(' ').slice(1).join(' ') || '',
        email_canonical: profile.email.toLowerCase(),
        username_canonical: (profile.preferred_username || profile.email.replace('@', '.')).toLowerCase(),
        identity_provider: 'oauth',
        identity_provider_id: profile.sub,
      };
      
      const createdUser = await gr.services.users.create(newUser);
      user = createdUser.entity;
      
      // Créer une entreprise globale si elle n'existe pas
      const companies = await gr.services.companies.getCompanies();
      let company = companies.getEntities()?.[0];
      if (!company) {
        const newCompany = {
          name: 'Tdrive',
          plan: { name: 'Local', limits: undefined, features: undefined },
        };
        company = await gr.services.companies.createCompany(newCompany);
      }
      
      // Ajouter l'utilisateur à l'entreprise
      await gr.services.companies.setUserRole(company.id, user.id, 'member');
      
      // Traiter les invitations en attente
      await gr.services.workspaces.processPendingUser(user);
      
      // Créer un workspace si l'utilisateur n'en a pas
      const workspaces = await gr.services.workspaces.getAllForUser(
        { userId: user.id },
        { id: company.id },
      );
      if (workspaces.length === 0) {
        await gr.services.workspaces.create(
          {
            company_id: company.id,
            name: `${user.first_name || user.username_canonical}'s space`,
          },
          { user: { id: user.id } },
        );
      }
    } else {
      this.logger.info(`User already exists: ${profile.email}`);
    }
    
    // Générer un JWT
    return gr.platformServices.auth.generateJWT(user.id, user.email_canonical, '', {
      track: user?.preferences?.allow_tracking || false,
      provider_id: user.identity_provider_id || 'oauth',
    });
  }

  async logout(authType: AuthType, request?: any): Promise<LogoutResponseDto> {
    return {
      successful: true,
      redirectUri: '/',
    };
  }

  private async getLogoutEndpoint(authType: AuthType, request?: any): Promise<string> {
    if (authType !== AuthType.OAuth) {
      return LOGIN_URL;
    }

    const config = getOAuthConfig();
    if (!config.enabled) {
      return LOGIN_URL;
    }

    const dynamicOauth = { ...config };
    if (request) {
      try {
        const hostname = request.hostname || request.headers?.host?.split(':')[0];
        if (hostname) {
          dynamicOauth.issuerUrl = this.buildIssuerUrl(config.issuerUrl, hostname);
          this.logger.debug(`Using dynamic issuerUrl for logout: ${dynamicOauth.issuerUrl}`);
        }
      } catch (error: any) {
        this.logger.warn(
          `Failed to extract hostname from request, using default issuerUrl: ${error.message}`,
        );
      }
    }

    const endpoint = await this.repository.getLogoutEndpoint(dynamicOauth);
    return endpoint || LOGIN_URL;
  }

  private buildIssuerUrl(templateUrl: string, hostname: string): string {
    const url = new URL(templateUrl);
    url.hostname = hostname;
    return url.toString().replace(/\/$/, '');
  }

  private generateState(): string {
    return randomBytes(32).toString('hex');
  }

  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }
}
