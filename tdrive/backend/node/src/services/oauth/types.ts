export enum OAuthTokenEndpointAuthMethod {
  ClientSecretPost = 'client_secret_post',
  ClientSecretBasic = 'client_secret_basic',
  None = 'none',
}

export interface OAuthConfig {
  enabled: boolean;
  autoLaunch: boolean;
  autoRegister: boolean;
  buttonText: string;
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  scope: string;
  signingAlgorithm: string;
  profileSigningAlgorithm: string;
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
  timeout: number;
}

export interface OAuthConfigDto {
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
}

export interface OAuthCallbackDto {
  url: string;
  state?: string;
  codeVerifier?: string;
}

export interface OAuthAuthorizeResponse {
  url: string;
}

export interface OAuthProfile {
  sub: string;
  email: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
}

export interface LogoutResponseDto {
  successful: boolean;
  redirectUri: string;
}

export enum AuthType {
  OAuth = 'oauth',
  Password = 'password',
}
