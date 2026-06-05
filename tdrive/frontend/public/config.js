// Runtime configuration - same-origin (zéro IP, zéro port en dur)
// Tout passe par l'origine du front ; le reverse-proxy nginx route par chemin.
// Identique en 192.168.x:3010, 100.x:3010 ou https://rdrive-xxx.ryvie.fr
(function () {
  var origin = window.location.origin;
  var wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  window.APP_CONFIG = {
    FRONTEND_URL: origin,
    BACKEND_URL: origin,
    WEBSOCKET_URL: wsProto + '//' + window.location.host + '/ws',
    ONLYOFFICE_CONNECTOR_URL: origin,
    ONLYOFFICE_DOCUMENT_SERVER_URL: origin + '/onlyoffice-ds',
  };

  console.log('🚀 [rDrive Config] same-origin:', window.APP_CONFIG);
})();
