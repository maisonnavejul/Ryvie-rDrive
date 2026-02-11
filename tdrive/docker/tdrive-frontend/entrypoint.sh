#!/bin/bash

if [ "$1" = "dev" ]
then
  if test -f "/tdrive-react/src/app/environment/environment.ts"; then
    echo "Configuration exists, doing nothing."
  else
    cp /tdrive-react/src/app/environment/environment.ts.dist.dev /tdrive-react/src/app/environment/environment.ts
  fi
else
  if test -f "/configuration/environment.ts"; then
    cp /configuration/environment.ts /tdrive-react/src/app/environment/environment.ts
  else
    cp /tdrive-react/src/app/environment/environment.ts.dist /tdrive-react/src/app/environment/environment.ts
  fi
fi

[[ -d "/etc/nginx/sites-enabled" ]] || mkdir /etc/nginx/sites-enabled

function _selfsigned() {
    self-signed.sh
    export NGINX_LISTEN="443 ssl"
    ln -sf /etc/nginx/sites-available/redirect /etc/nginx/sites-enabled/
}

case $SSL_CERTS in
  selfsigned)
    _selfsigned
    ;;
  off|no|non|none|false)
    export NGINX_LISTEN="80"
    sed -i '/ *ssl_/d' /etc/nginx/sites-available/site.template
    ;;
  *)
    echo "SSL_CERTS var not defined setting selfsigned"
    export SSL_CERTS=selfsigned
    _selfsigned
    ;;
esac

NODE_HOST="${NODE_HOST:-http://node:3000}"
# Resolve ONLYOFFICE_CONNECTOR_HOST: if it contains a hostname that's in /etc/hosts, resolve it to IP
ONLYOFFICE_CONNECTOR_HOST="${ONLYOFFICE_CONNECTOR_HOST:-http://onlyoffice-connector:5000}"
OO_HOST=$(echo "$ONLYOFFICE_CONNECTOR_HOST" | sed -E 's|https?://([^:]+).*|\1|')
OO_IP=$(getent hosts "$OO_HOST" 2>/dev/null | awk '{print $1}')
if [ -n "$OO_IP" ] && [ "$OO_IP" != "$OO_HOST" ]; then
  ONLYOFFICE_CONNECTOR_HOST=$(echo "$ONLYOFFICE_CONNECTOR_HOST" | sed "s|$OO_HOST|$OO_IP|")
  echo "Resolved ONLYOFFICE_CONNECTOR_HOST to $ONLYOFFICE_CONNECTOR_HOST"
fi
export NODE_HOST ONLYOFFICE_CONNECTOR_HOST
envsubst '$${NODE_HOST} $${NGINX_LISTEN} $${ONLYOFFICE_CONNECTOR_HOST}' < /etc/nginx/sites-available/site.template > /etc/nginx/sites-enabled/site

# Inject runtime environment variables into config.js
if [ -f /tdrive-react/build/config.js ]; then
  sed -i "s|__REACT_APP_FRONTEND_URL__|${REACT_APP_FRONTEND_URL:-}|g" /tdrive-react/build/config.js
  sed -i "s|__REACT_APP_BACKEND_URL__|${REACT_APP_BACKEND_URL:-}|g" /tdrive-react/build/config.js
  sed -i "s|__REACT_APP_WEBSOCKET_URL__|${REACT_APP_WEBSOCKET_URL:-}|g" /tdrive-react/build/config.js
  sed -i "s|__REACT_APP_ONLYOFFICE_CONNECTOR_URL__|${REACT_APP_ONLYOFFICE_CONNECTOR_URL:-}|g" /tdrive-react/build/config.js
  sed -i "s|__REACT_APP_ONLYOFFICE_DOCUMENT_SERVER_URL__|${REACT_APP_ONLYOFFICE_DOCUMENT_SERVER_URL:-}|g" /tdrive-react/build/config.js
  sed -i "s|__REACT_APP_FRONTEND_URL_PRIVATE__|${REACT_APP_FRONTEND_URL_PRIVATE:-}|g" /tdrive-react/build/config.js
fi

nginx -g "daemon off;"
