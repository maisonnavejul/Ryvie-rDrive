import React, { useEffect, useState } from 'react';
import { Spin, Typography } from 'antd';
import OAuthService from '@features/auth/oauth-service';
import Logger from '@features/global/framework/logger-service';

const { Text } = Typography;

const logger = Logger.getLogger('OAuthAutoLaunch');

export const OAuthAutoLaunch: React.FC = () => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const launchOAuth = async () => {
      try {
        // Vérifier si on doit lancer automatiquement
        const config = await OAuthService.getConfig();
        
        if (!config) {
          logger.debug('No OAuth config available');
          return;
        }

        if (!config.enabled) {
          logger.debug('OAuth is not enabled');
          return;
        }

        if (!config.autoLaunch) {
          logger.debug('OAuth auto-launch is disabled');
          return;
        }

        // Vérifier si on revient d'un échec OAuth (éviter la boucle)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('fromOAuthError') === 'true') {
          logger.warn('Skipping auto-launch after OAuth error');
          return;
        }

        // Lancer le flux OAuth automatiquement
        logger.info('Auto-launching OAuth flow');
        setIsLaunching(true);

        const authUrl = await OAuthService.authorize('/oauth-callback');
        
        if (authUrl) {
          logger.info('Redirecting to OAuth provider:', authUrl);
          // Rediriger vers le fournisseur OAuth
          window.location.href = authUrl;
        } else {
          setError('Impossible de démarrer le flux OAuth');
          setIsLaunching(false);
        }
      } catch (err: any) {
        logger.error('OAuth auto-launch failed:', err);
        setError(err.message || 'Erreur lors du lancement OAuth');
        setIsLaunching(false);
      }
    };

    // Lancer après un court délai pour permettre le chargement de la page
    const timer = setTimeout(() => {
      launchOAuth();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (!isLaunching && !error) {
    return null;
  }

  return (
    <div style={{ 
      textAlign: 'center', 
      padding: '20px',
      marginTop: '20px'
    }}>
      {isLaunching && (
        <>
          <Spin size="large" />
          <div style={{ marginTop: '16px' }}>
            <Text>Redirection vers le système d'authentification...</Text>
          </div>
        </>
      )}
      {error && (
        <div style={{ color: 'red' }}>
          <Text type="danger">{error}</Text>
        </div>
      )}
    </div>
  );
};

export default OAuthAutoLaunch;
