import { logger } from '../../core/platform/framework/logger';
import { OAuthConfig, OAuthProfile, OAuthTokenEndpointAuthMethod } from './types';

export class OAuthRepository {
  private logger = logger;

  async getLogoutEndpoint(config: OAuthConfig): Promise<string | undefined> {
    try {
      const client = await this.getClient(config);
      return client.issuer.end_session_endpoint;
    } catch (error: any) {
      this.logger.error(`Error getting logout endpoint: ${error.message}`, error?.stack);
      return undefined;
    }
  }

  async authorize(
    config: OAuthConfig,
    redirectUri: string,
    state: string,
    codeChallenge?: string,
  ): Promise<string> {
    try {
      const client = await this.getClient(config);
      
      const authParams: any = {
        redirect_uri: redirectUri,
        scope: config.scope,
        state: state,
      };

      if (codeChallenge) {
        authParams.code_challenge = codeChallenge;
        authParams.code_challenge_method = 'S256';
      }

      const authorizationUrl = client.authorizationUrl(authParams);
      
      this.logger.debug(`Generated authorization URL: ${authorizationUrl}`);
      return authorizationUrl;
    } catch (error: any) {
      this.logger.error(`Error in OAuth authorize: ${error.message}`, error?.stack);
      throw new Error(`Error in OAuth authorize: ${error.message}`);
    }
  }

  async getProfile(
    config: OAuthConfig,
    callbackUrl: string,
    expectedState: string,
    codeVerifier?: string,
  ): Promise<OAuthProfile> {
    try {
      const client = await this.getClient(config);
      const url = new URL(callbackUrl);
      
      this.logger.debug(`Callback URL received: ${callbackUrl}`);
      this.logger.debug(`Parsed URL origin: ${url.origin}`);
      this.logger.debug(`Parsed URL pathname: ${url.pathname}`);
      this.logger.debug(`Redirect URI for token exchange: ${url.origin + url.pathname}`);
      
      const params = client.callbackParams(url.href);
      
      if (params.state !== expectedState) {
        throw new Error('State mismatch in OAuth callback');
      }

      const callbackParams: any = {
        redirect_uri: url.origin + url.pathname,
        state: expectedState,
      };

      if (codeVerifier) {
        callbackParams.code_verifier = codeVerifier;
      }

      const tokenSet = await client.callback(
        url.origin + url.pathname,
        params,
        callbackParams,
      );

      this.logger.debug('Token exchange successful');

      const userinfo = await client.userinfo(tokenSet);

      return {
        sub: userinfo.sub,
        email: userinfo.email as string,
        name: userinfo.name as string,
        preferred_username: userinfo.preferred_username as string,
        given_name: userinfo.given_name as string,
        family_name: userinfo.family_name as string,
      };
    } catch (error: any) {
      this.logger.error(`Error getting OAuth profile: ${error.message}`, error?.stack);
      throw new Error(`Error getting OAuth profile: ${error.message}`);
    }
  }

  private async getClient(config: OAuthConfig): Promise<any> {
    try {
      const { Issuer } = await import('openid-client');

      this.logger.debug(`Starting OpenID Discovery for: ${config.issuerUrl}`);

      const issuer = await Issuer.discover(config.issuerUrl);

      const client = new issuer.Client({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        response_types: ['code'],
        token_endpoint_auth_method: config.tokenEndpointAuthMethod,
      });

      this.logger.debug(`OpenID Discovery completed for: ${config.issuerUrl}`);
      return client;
    } catch (error: any) {
      this.logger.error(
        `Error in OAuth discovery for ${config.issuerUrl}: ${error.message}`,
        error?.stack,
      );
      throw new Error(`Error in OAuth discovery: ${error.message}`);
    }
  }

  private async getTokenAuthMethod(
    method: OAuthTokenEndpointAuthMethod,
    clientSecret?: string,
  ): Promise<any> {
    switch (method) {
      case OAuthTokenEndpointAuthMethod.ClientSecretPost:
        return undefined;
      case OAuthTokenEndpointAuthMethod.ClientSecretBasic:
        return undefined;
      case OAuthTokenEndpointAuthMethod.None:
        return undefined;
      default:
        return undefined;
    }
  }
}
