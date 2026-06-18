#!/bin/sh
# Hook de déconnexion IA de rDrive (partie OnlyOffice), exécuté par Ryvie SUR L'HÔTE.
# Vide la clé `aiSettings` du local.json du Document Server → plus de provider/modèle
# exposé au plugin IA (IA désactivée côté OnlyOffice), puis relance docservice.
set -e

OO_CONTAINER="app-rdrive-onlyoffice"
LOCAL_JSON="/etc/onlyoffice/documentserver/local.json"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Récupère le local.json courant (s'il échoue, conteneur absent → rien à faire).
docker exec "$OO_CONTAINER" cat "$LOCAL_JSON" > "$TMP/local.json" 2>/dev/null || {
  echo "rdrive/onlyoffice: Document Server introuvable, rien à déconnecter."
  exit 0
}

# Remet aiSettings à vide (on ne touche QUE cette clé).
RYVIE_IN="$TMP/local.json" RYVIE_OUT="$TMP/out.json" node <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.env.RYVIE_IN, 'utf8'));
cfg.aiSettings = {
  version: 4,
  providers: {},
  models: [],
  actions: {},
  proxy: '',
  timeout: '5m',
  allowedCorsOrigins: [],
};

// Retire le plugin IA de l'autostart (ajouté au connect).
const AI_GUID = 'asc.{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}';
const autostart = cfg.services && cfg.services.CoAuthoring && cfg.services.CoAuthoring.plugins
  && Array.isArray(cfg.services.CoAuthoring.plugins.autostart)
  ? cfg.services.CoAuthoring.plugins.autostart
  : null;
if (autostart) {
  cfg.services.CoAuthoring.plugins.autostart = autostart.filter(g => g !== AI_GUID);
}

fs.writeFileSync(process.env.RYVIE_OUT, JSON.stringify(cfg, null, 2));
console.log('aiSettings vidé');
NODE

docker cp "$TMP/out.json" "$OO_CONTAINER:$LOCAL_JSON"
docker exec "$OO_CONTAINER" supervisorctl restart ds:docservice >/dev/null 2>&1 || true

# (Le détachement du réseau IA est géré par aiService via `ai.containers`.)

echo "rdrive/onlyoffice: IA déconnectée."
