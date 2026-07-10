#!/bin/sh
# Hook de connexion IA de rDrive (partie OnlyOffice), exécuté par Ryvie (aiService.runHook)
# SUR L'HÔTE (cwd = .../Ryvie-rDrive/tdrive). Reçoit en env : RYVIE_AI_API_KEY (master key
# LiteLLM), RYVIE_AI_BASE_URL (http://ip:PORT/v1), RYVIE_AI_MODEL (alias stable ryvie-default),
# RYVIE_LOCAL_IP…
#
# OnlyOffice ne lit pas d'env pour l'IA : sa config vit dans la clé `aiSettings` du
# local.json du Document Server. On la pré-configure pour TOUS les utilisateurs vers
# le provider intégré « OpenAI » pointé sur LiteLLM. ⚠️ Dès qu'on injecte cette config
# serveur, le plugin force ses requêtes via `aiSettings.proxy` → on pointe ce proxy sur
# l'endpoint /ai-proxy du connecteur (qui relaie vers LiteLLM).
set -e

OO_CONTAINER="app-rdrive-onlyoffice"
LOCAL_JSON="/etc/onlyoffice/documentserver/local.json"
MODEL="${RYVIE_AI_MODEL:-ryvie-default}"
: "${RYVIE_AI_API_KEY:?master key LiteLLM manquante}"

# OnlyOffice 9.4.0 fait ses requêtes IA CÔTÉ SERVEUR (le conteneur Document Server),
# exactement comme n8n. On pointe LiteLLM par son NOM DE CONTENEUR (DNS du réseau dédié
# `ryvie-ai`, auquel aiService rattache ce conteneur via `ai.containers`) → INDÉPENDANT
# DE L'IP DE L'HÔTE. `RYVIE_AI_BASE_URL` = http://ryvie-litellm:PORT/v1 ; on retire /v1
# (le plugin OnlyOffice le rajoute seul). `proxy` reste vide → appel direct, aucun proxy.
PROVIDER_URL=$(printf '%s' "${RYVIE_AI_BASE_URL:-http://ryvie-litellm:4010/v1}" | sed -E 's#/v1/?$##')

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1) Récupère le local.json courant (généré par l'entrypoint OnlyOffice).
docker exec "$OO_CONTAINER" cat "$LOCAL_JSON" > "$TMP/local.json"

# 2) Injecte aiSettings (merge non destructif : on ne touche QUE la clé aiSettings).
RYVIE_IN="$TMP/local.json" RYVIE_OUT="$TMP/out.json" \
RYVIE_MODEL="$MODEL" RYVIE_KEY="$RYVIE_AI_API_KEY" \
RYVIE_PROVIDER_URL="$PROVIDER_URL" \
node <<'NODE'
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.env.RYVIE_IN, 'utf8'));
const model = process.env.RYVIE_MODEL;
const key = process.env.RYVIE_KEY;
const providerUrl = process.env.RYVIE_PROVIDER_URL;

// endpoints:[1] = v1/chat/completions ; capabilities:1 = Chat (couvre Chat,
// Summarization, Translation, TextAnalyze qui sont toutes en capability Chat).
const rawModel = { id: model, object: 'model', name: model, endpoints: [1], options: {} };
const action = { model, capabilities: 1 };

cfg.aiSettings = {
  version: 4, // AI.Storage.Version du plugin (v3.2.3)
  providers: {
    // Provider intégré « OpenAI » réutilisé : LiteLLM est OpenAI-compatible, et le
    // plugin ajoute /v1 tout seul → requêtes vers <url>/v1/chat/completions.
    OpenAI: { name: 'OpenAI', url: providerUrl, key: key, models: [rawModel] },
  },
  models: [
    { capabilities: 1, provider: 'OpenAI', name: 'Ryvie AI (' + model + ')', id: model },
  ],
  actions: {
    Chat:          Object.assign({ name: 'Ask AI',        icon: 'ask-ai' },           action),
    Summarization: Object.assign({ name: 'Summarization', icon: 'summarization' },    action),
    Translation:   Object.assign({ name: 'Translation',   icon: 'translation' },      action),
    TextAnalyze:   Object.assign({ name: 'Text analysis', icon: 'text-analysis-ai' }, action),
  },
  proxy: '', // appel direct DS → LiteLLM (pas de proxy ; cf. n8n)
  timeout: '5m',
  allowedCorsOrigins: [],
};

// Le plugin IA est de type « background » : pour qu'il se charge et enregistre ses
// actions (Chat/Summarization/…) à l'ouverture de l'éditeur, on l'ajoute à l'autostart.
const AI_GUID = 'asc.{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}';
cfg.services = cfg.services || {};
cfg.services.CoAuthoring = cfg.services.CoAuthoring || {};
cfg.services.CoAuthoring.plugins = cfg.services.CoAuthoring.plugins || {};
const autostart = Array.isArray(cfg.services.CoAuthoring.plugins.autostart)
  ? cfg.services.CoAuthoring.plugins.autostart
  : [];
if (!autostart.includes(AI_GUID)) autostart.push(AI_GUID);
cfg.services.CoAuthoring.plugins.autostart = autostart;

fs.writeFileSync(process.env.RYVIE_OUT, JSON.stringify(cfg, null, 2));
console.log('aiSettings: provider=' + providerUrl + ' (direct, sans proxy) model=' + model);
NODE

# 3) Réinjecte le local.json modifié.
docker cp "$TMP/out.json" "$OO_CONTAINER:$LOCAL_JSON"

# 4) Redémarre docservice pour relire la config (coupe brièvement les sessions
#    d'édition en cours ; action d'admin explicite, acceptable).
docker exec "$OO_CONTAINER" supervisorctl restart ds:docservice >/dev/null 2>&1 || true

echo "rdrive/onlyoffice: IA connectée (modèle $MODEL via LiteLLM, proxy=$PROXY_URL)."
