// Runtime configuration - détecte automatiquement l'environnement
(function() {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  console.log('🔍 [rDrive Config] Détection environnement - hostname:', hostname, 'protocol:', protocol);
  
  // Détection des réseaux locaux/privés : localhost, ryvie.local, et plages IP privées (10.x, 172.16-31.x, 192.168.x, 100.x Tailscale)
  const isLocal = hostname === 'ryvie.local' || 
                  hostname === 'localhost' || 
                  hostname.startsWith('192.168.') || 
                  hostname.startsWith('10.') ||
                  hostname.startsWith('172.') ;
  
  console.log('🔍 [rDrive Config] isLocal:', isLocal);
  
  if (isLocal) {
    // Configuration locale
    // Récupération de l'IP privée depuis la variable d'environnement injectée au build
    const privateIP = '__REACT_APP_FRONTEND_URL_PRIVATE__';
    
    console.log('🔍 [rDrive Config] Variable REACT_APP_FRONTEND_URL_PRIVATE brute:', privateIP);
    
    // Vérifier si la variable a été remplacée (si elle ne contient pas de __)
    const hasPrivateIP = privateIP && !privateIP.includes('__');
    
    console.log('🔍 [rDrive Config] hasPrivateIP:', hasPrivateIP, '- Valeur:', hasPrivateIP ? privateIP : 'NON DÉFINIE');
    
    // Si on accède via ryvie.local, on utilise l'IP privée pour OnlyOffice pour éviter les problèmes CORS
    const usePrivateIP = hostname === 'ryvie.local' && hasPrivateIP;
    const onlyofficeHost = usePrivateIP ? privateIP : hostname;
    
    console.log('🔍 [rDrive Config] usePrivateIP:', usePrivateIP);
    console.log('🔍 [rDrive Config] onlyofficeHost calculé:', onlyofficeHost);
    
    if (hostname === 'ryvie.local' && !hasPrivateIP) {
      console.warn('⚠️ [rDrive Config] Accès via ryvie.local mais REACT_APP_FRONTEND_URL_PRIVATE non définie, utilisation de:', hostname);
    }
    
    window.APP_CONFIG = {
      FRONTEND_URL: protocol + '//' + hostname,
      BACKEND_URL: protocol + '//' + hostname + ':4000',
      WEBSOCKET_URL: (protocol === 'https:' ? 'wss:' : 'ws:') + '//' + hostname + ':4000/ws',
      // Le connecteur utilise l'IP privée si on accède via ryvie.local
      ONLYOFFICE_CONNECTOR_URL: protocol + '//' + onlyofficeHost + ':5000',
      ONLYOFFICE_DOCUMENT_SERVER_URL: protocol + '//' + onlyofficeHost + ':8090'
    };
    
    console.log('🔧 [rDrive Config] Mode local détecté:', hostname, '→ OnlyOffice via:', onlyofficeHost);
  } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    // IP distante (tunnel Tailscale 100.x) → ports directs sur CET hôte (dynamique, plus d'IP en dur)
    console.log('🌐 [rDrive Config] Mode IP distante détecté:', hostname);
    const wsProto = (protocol === 'https:' ? 'wss:' : 'ws:');
    window.APP_CONFIG = {
      FRONTEND_URL: protocol + '//' + hostname + ':3010',
      BACKEND_URL: protocol + '//' + hostname + ':4000',
      WEBSOCKET_URL: wsProto + '//' + hostname + ':4000/ws',
      ONLYOFFICE_CONNECTOR_URL: protocol + '//' + hostname + ':5000',
      ONLYOFFICE_DOCUMENT_SERVER_URL: protocol + '//' + hostname + ':8090'
    };
  } else {
    // Domaine public (*.ryvie.fr) → MÊME ORIGINE : le nginx du frontend proxie /api, /internal, /plugins, /auth
    console.log('🌐 [rDrive Config] Mode public (même origine) détecté:', hostname);
    const wsProto = (protocol === 'https:' ? 'wss:' : 'ws:');
    window.APP_CONFIG = {
      FRONTEND_URL: protocol + '//' + hostname,
      BACKEND_URL: protocol + '//' + hostname,
      WEBSOCKET_URL: wsProto + '//' + hostname + '/ws',
      ONLYOFFICE_CONNECTOR_URL: protocol + '//' + hostname,
      ONLYOFFICE_DOCUMENT_SERVER_URL: protocol + '//' + hostname
    };
  }
  
  console.log('🚀 [rDrive Config] Configuration finale:', window.APP_CONFIG);
})();
