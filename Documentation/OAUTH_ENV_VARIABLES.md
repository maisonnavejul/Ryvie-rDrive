# Variables d'environnement OAuth pour rDrive

## 📋 Variables à ajouter dans votre fichier `.env`

Basé sur l'implémentation de rPictures, voici les variables OAuth à ajouter dans `/data/apps/Ryvie-rDrive/tdrive/.env` :

```env
# ============================================
# Configuration OAuth avec issuerUrl dynamique
# ============================================

# Activer/Désactiver OAuth
OAUTH_ENABLED=true

# URL de l'issuer OAuth (fallback par défaut)
# Cette URL sera remplacée dynamiquement par l'IP/hostname du client
OAUTH_ISSUER_URL=http://ryvie.local:3005/realms/ryvie

# Client ID pour rDrive
OAUTH_CLIENT_ID=ryvie-rdrive

# Client Secret (à changer en production !)
OAUTH_CLIENT_SECRET=rdrive-secret-change-in-production

# Scopes OAuth demandés
OAUTH_SCOPE=openid email profile

# Algorithme de signature des tokens
OAUTH_SIGNING_ALGORITHM=RS256

# Algorithme de signature du profil utilisateur
OAUTH_PROFILE_SIGNING_ALGORITHM=none

# Texte du bouton de connexion
OAUTH_BUTTON_TEXT=Se connecter avec Ryvie

# Auto-enregistrement des nouveaux utilisateurs
OAUTH_AUTO_REGISTER=true

# Lancement automatique du flux OAuth
OAUTH_AUTO_LAUNCH=true

# Timeout pour les requêtes OAuth (en millisecondes)
OAUTH_TIMEOUT=30000

# Claims personnalisés (optionnel)
OAUTH_STORAGE_LABEL_CLAIM=preferred_username
OAUTH_STORAGE_QUOTA_CLAIM=immich_quota
OAUTH_ROLE_CLAIM=immich_role

# Quota de stockage par défaut (en Go, null = illimité)
OAUTH_DEFAULT_STORAGE_QUOTA=

# Mobile override (pour les applications mobiles)
OAUTH_MOBILE_OVERRIDE_ENABLED=false
OAUTH_MOBILE_REDIRECT_URI=
```

## 🔧 Configuration actuelle recommandée pour rDrive

Voici la configuration complète recommandée en combinant vos variables existantes avec OAuth :

```env
# Configuration publique (NetBird) - pour accès remote
REACT_APP_FRONTEND_URL=http://100.104.214.194:3010
REACT_APP_BACKEND_URL=http://100.104.214.194:4000
REACT_APP_WEBSOCKET_URL=ws://100.104.214.194:4000/ws
REACT_APP_ONLYOFFICE_CONNECTOR_URL=http://100.104.214.194:5000
REACT_APP_ONLYOFFICE_DOCUMENT_SERVER_URL=http://100.104.214.194:8090

# IP privée pour détection locale
REACT_APP_FRONTEND_URL_PRIVATE=10.128.255.101

# Service OAuth centralisé (NE PAS MODIFIER)
OAUTH_SERVICE_URL=https://cloudoauth-files.ryvie.fr

# ID unique de cette instance (généré automatiquement au premier démarrage si vide)
INSTANCE_ID=1b72b206-e923-4d4e-b55a-ebc184cb9f80

# LDAP Configuration
LDAP_BIND_PASSWORD=MkNj4I4kCseK1ZEeuDa9

# ============================================
# Configuration OAuth Keycloak (issuerUrl dynamique)
# ============================================

# Activer OAuth avec Keycloak
OAUTH_ENABLED=true

# URL de l'issuer OAuth (fallback - sera remplacé dynamiquement)
# Le système utilisera automatiquement l'IP/hostname du client
OAUTH_ISSUER_URL=http://ryvie.local:3005/realms/ryvie

# Client ID pour rDrive
OAUTH_CLIENT_ID=ryvie-rdrive

# Client Secret (IMPORTANT: à changer en production !)
OAUTH_CLIENT_SECRET=rdrive-secret-change-in-production

# Scopes OAuth
OAUTH_SCOPE=openid email profile

# Algorithmes de signature
OAUTH_SIGNING_ALGORITHM=RS256
OAUTH_PROFILE_SIGNING_ALGORITHM=none

# Interface utilisateur
OAUTH_BUTTON_TEXT=Se connecter avec Ryvie

# Comportement
OAUTH_AUTO_REGISTER=true
OAUTH_AUTO_LAUNCH=true
OAUTH_TIMEOUT=30000
```

## 🔑 Points importants

### 1. issuerUrl dynamique

L'`OAUTH_ISSUER_URL` est une URL de **fallback**. Le système construira automatiquement l'URL correcte en fonction de l'IP/hostname utilisé par le client :

- Client accède via `http://10.128.255.101:3010` → OAuth utilisera `http://10.128.255.101:3005/realms/ryvie`
- Client accède via `http://100.104.214.194:3010` → OAuth utilisera `http://100.104.214.194:3005/realms/ryvie`
- Client accède via `http://ryvie.local:3010` → OAuth utilisera `http://ryvie.local:3005/realms/ryvie`

### 2. Différence avec OAUTH_SERVICE_URL

- **OAUTH_SERVICE_URL** : Service centralisé pour Dropbox/Google Drive (cloudoauth-files.ryvie.fr)
- **OAUTH_ISSUER_URL** : Serveur Keycloak local pour l'authentification des utilisateurs (port 3005)

Ce sont **deux systèmes OAuth différents** :
- Un pour l'authentification utilisateur (Keycloak)
- Un pour les tokens cloud (Dropbox/Google)

### 3. Configuration Keycloak requise

Sur votre serveur Keycloak (port 3005), vous devez créer un client avec :

```
Client ID: ryvie-rdrive
Client Secret: rdrive-secret-change-in-production
Valid Redirect URIs: 
  - http://10.128.255.101:3010/api/v1/oauth/callback
  - http://100.104.214.194:3010/api/v1/oauth/callback
  - http://ryvie.local:3010/api/v1/oauth/callback
  - http://localhost:3010/api/v1/oauth/callback
```

## 🚀 Activation du service OAuth

Pour activer le service OAuth dans rDrive, vous devez également :

1. **Ajouter le service dans la configuration** (`config/default.json`) :

```json
{
  "services": [
    "admin",
    "auth",
    "diagnostics",
    "push",
    "storage",
    "webserver",
    "database",
    "cron",
    "search",
    "rclone",
    "message-queue",
    "tracker",
    "general",
    "user",
    "files",
    "workspaces",
    "console",
    "counter",
    "statistics",
    "email-pusher",
    "documents",
    "applications",
    "applications-api",
    "tags",
    "oauth-service"  // ← Ajouter cette ligne
  ]
}
```

2. **Créer le service Tdrive** (voir `OAUTH_DYNAMIC_ISSUER_IMPLEMENTATION.md`)

## 🔒 Sécurité en production

En production, pensez à :

1. **Changer le client secret** :
```env
OAUTH_CLIENT_SECRET=votre-secret-securise-aleatoire-ici
```

2. **Utiliser HTTPS** :
```env
OAUTH_ISSUER_URL=https://ryvie.local:3005/realms/ryvie
```

3. **Limiter les redirect URIs** dans Keycloak aux domaines autorisés

4. **Activer les logs** pour surveiller les tentatives de connexion

## 📝 Commandes utiles

### Tester la configuration OAuth

```bash
# Vérifier que Keycloak est accessible
curl http://10.128.255.101:3005/realms/ryvie/.well-known/openid-configuration

# Vérifier la configuration OAuth de rDrive
curl http://100.104.214.194:4000/api/v1/oauth/config
```

### Redémarrer les services

```bash
cd /data/apps/Ryvie-rDrive/tdrive
docker-compose down
docker-compose up -d
```

## 🐛 Debugging

Si OAuth ne fonctionne pas :

1. Vérifier les logs du backend :
```bash
docker-compose logs -f node
```

2. Vérifier que Keycloak est accessible depuis le container :
```bash
docker-compose exec node curl http://10.128.255.101:3005/realms/ryvie/.well-known/openid-configuration
```

3. Vérifier les variables d'environnement :
```bash
docker-compose exec node env | grep OAUTH
```
