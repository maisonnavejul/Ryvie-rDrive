export default {
  env_dev: false,
  sentry_dsn: false,
  front_root_url: (document.location.protocol || "http") + '//' + document.location.host,
  api_root_url: (document.location.protocol || "http") + '//' + document.location.host,
  websocket_url: (document.location.protocol || "http").replace("http", "ws") + '//' + document.location.host
};

/*
export default {
  env_dev: false,
  front_root_url: 'https://web.tdrive.app',
  api_root_url: 'https://api.tdrive.app',
  websocket_url: 'wss://api.tdrive.app'
};
*/