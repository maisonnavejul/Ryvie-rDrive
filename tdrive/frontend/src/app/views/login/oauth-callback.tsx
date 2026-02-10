import React, { useEffect, useState } from 'react';
import { Spin, Typography } from 'antd';
import OAuthService from '@features/auth/oauth-service';
import AuthService from '@features/auth/auth-service';
import Logger from '@features/global/framework/logger-service';

const { Text } = Typography;

const logger = Logger.getLogger('OAuthCallback');

export const OAuthCallback: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        logger.info('Handling OAuth callback');
        
        // Récupérer les query params de Keycloak (state, code, session_state, iss)
        const queryString = window.location.search;
        logger.debug('Callback query params:', queryString);

        // Appeler l'API backend avec les mêmes query params
        const backendUrl = `/api/v1/oauth/callback${queryString}`;
        logger.debug('Calling backend:', backendUrl);

        const response = await fetch(backendUrl);
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        if (!data.access_token) {
          throw new Error('No access token received');
        }

        logger.info('Access token received, storing in localStorage');
        
        // Stocker le token exactement comme le fait le login LDAP
        AuthService.onNewToken(data.access_token);

        // Rediriger vers la page d'accueil
        logger.info('Redirecting to home page');
        window.location.href = '/';
      } catch (err: any) {
        logger.error('OAuth callback failed:', err);
        setError(err.message || 'Erreur lors de la connexion OAuth');
        
        // Rediriger vers la page de login avec un paramètre d'erreur
        setTimeout(() => {
          window.location.href = '/login?fromOAuthError=true';
        }, 3000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div style={{ 
      textAlign: 'center', 
      padding: '40px',
      marginTop: '40px'
    }}>
      {!error && (
        <>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>
            <Text>Finalisation de la connexion...</Text>
          </div>
        </>
      )}
      {error && (
        <div style={{ color: 'red', marginTop: '16px' }}>
          <Text type="danger">{error}</Text>
          <div style={{ marginTop: '8px' }}>
            <Text>Redirection vers la page de connexion...</Text>
          </div>
        </div>
      )}
    </div>
  );
};

export default OAuthCallback;
