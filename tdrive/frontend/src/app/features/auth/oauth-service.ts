import { TdriveService } from '@features/global/framework/registry-decorator-service';
import Logger from '@features/global/framework/logger-service';
import Api from '@features/global/framework/api-service';

export interface OAuthConfig {
  enabled: boolean;
  buttonText: string;
  autoLaunch: boolean;
  issuerUrl: string;
}

export interface OAuthAuthorizeResponse {
  url: string;
}

@TdriveService('OAuthService')
class OAuthService {
  private logger: Logger.Logger;
  private config: OAuthConfig | null = null;

  constructor() {
    this.logger = Logger.getLogger('OAuthService');
  }

  async getConfig(): Promise<OAuthConfig | null> {
    if (this.config) {
      return this.config;
    }

    try {
      const response = await Api.get<OAuthConfig>('/api/v1/oauth/config');
      this.config = response;
      this.logger.debug('OAuth config loaded:', this.config);
      return this.config;
    } catch (error) {
      this.logger.error('Failed to load OAuth config:', error);
      return null;
    }
  }

  async authorize(redirectUri: string): Promise<string | null> {
    try {
      const currentUrl = window.location.origin + redirectUri;
      this.logger.info('Starting OAuth authorization with redirectUri:', currentUrl);

      const response = await Api.get<OAuthAuthorizeResponse>(
        `/api/v1/oauth/authorize?redirectUri=${encodeURIComponent(currentUrl)}`
      );

      if (response?.url) {
        this.logger.info('OAuth authorization URL received:', response.url);
        return response.url;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to start OAuth authorization:', error);
      return null;
    }
  }

  async callback(callbackUrl: string): Promise<any> {
    try {
      this.logger.info('Processing OAuth callback');

      const response = await Api.post('/api/v1/oauth/callback', {
        url: callbackUrl,
      });

      this.logger.info('OAuth callback successful');
      return response;
    } catch (error) {
      this.logger.error('OAuth callback failed:', error);
      throw error;
    }
  }

  isEnabled(): boolean {
    return this.config?.enabled === true;
  }

  shouldAutoLaunch(): boolean {
    return this.config?.autoLaunch === true && this.config?.enabled === true;
  }
}

export default new OAuthService();
