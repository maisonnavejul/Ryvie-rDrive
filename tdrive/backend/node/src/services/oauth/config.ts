import { OAuthConfig, OAuthTokenEndpointAuthMethod } from './types';

export const defaults: { oauth: OAuthConfig } = {
  oauth: {
    autoLaunch: true,
    autoRegister: true,
    buttonText: process.env.OAUTH_BUTTON_TEXT || 'Se connecter avec Ryvie',
    clientId: process.env.OAUTH_CLIENT_ID || 'ryvie-rdrive',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || 'rdrive-secret-change-in-production',
    enabled: process.env.OAUTH_ENABLED !== 'false',
    // URL publique (doit correspondre à l'iss du token)
    issuerUrl: process.env.OAUTH_ISSUER_URL || 'http://ryvie.local:3005/realms/ryvie',
    scope: process.env.OAUTH_SCOPE || 'openid email profile',
    signingAlgorithm: process.env.OAUTH_SIGNING_ALGORITHM || 'RS256',
    profileSigningAlgorithm: process.env.OAUTH_PROFILE_SIGNING_ALGORITHM || 'none',
    tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod.ClientSecretPost,
    timeout: process.env.OAUTH_TIMEOUT ? Number(process.env.OAUTH_TIMEOUT) : 30_000,
  },
};

export function getOAuthConfig(): OAuthConfig {
  return { ...defaults.oauth };
}
