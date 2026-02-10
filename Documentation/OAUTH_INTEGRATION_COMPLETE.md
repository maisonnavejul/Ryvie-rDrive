# 🎉 Intégration OAuth complète pour rDrive

## ✅ Ce qui a été implémenté

### Backend (Node.js/TypeScript)

#### 1. Structure OAuth complète
- **`/tdrive/backend/node/src/services/oauth/`**
  - `types.ts` - Types et interfaces TypeScript
  - `config.ts` - Configuration par défaut avec variables d'environnement
  - `repository.ts` - Communication avec Keycloak via openid-client v5.4.0
  - `service.ts` - Logique métier avec **issuerUrl dynamique**
  - `controller.ts` - Endpoints HTTP Fastify
  - `index.ts` - Exports publics

#### 2. Service Tdrive OAuth
- **`/tdrive/backend/node/src/services/oauth-service/index.ts`**
  - Service intégré dans le framework Tdrive
  - Enregistré automatiquement au démarrage
  - Expose les endpoints `/api/v1/oauth/*`

#### 3. Endpoints disponibles
- `GET /api/v1/oauth/authorize` - Démarre le flux OAuth
- `GET /api/v1/oauth/callback` - Callback après authentification
- `POST /api/v1/oauth/logout` - Déconnexion OAuth
- `GET /api/v1/oauth/config` - Configuration OAuth publique

#### 4. Configuration serveur
- Service `oauth-service` ajouté dans `config/default.json`
- Chargement automatique au démarrage du serveur

### Frontend (React/TypeScript)

#### 1. Service OAuth Frontend
- **`/tdrive/frontend/src/app/features/auth/oauth-service.ts`**
  - Service pour communiquer avec l'API OAuth backend
  - Méthodes : `getConfig()`, `authorize()`, `callback()`
  - Gestion du cache de configuration

#### 2. Composant de lancement automatique
- **`/tdrive/frontend/src/app/views/login/internal/login-view/oauth-auto-launch.tsx`**
  - Détecte si OAuth est activé avec `autoLaunch: true`
  - Lance automatiquement le flux OAuth à l'arrivée sur la page de login
  - Affiche un spinner pendant la redirection
  - Évite les boucles infinies en cas d'erreur

#### 3. Intégration dans la page de login
- **`/tdrive/frontend/src/app/views/login/internal/login-view/login-view.jsx`**
  - Composant `OAuthAutoLaunch` intégré
  - Bouton OAuth manuel (si `autoLaunch: false`)
  - Chargement dynamique de la configuration OAuth

## 🔧 Configuration requise

### 1. Variables d'environnement (.env)

Ajouter dans `/data/apps/Ryvie-rDrive/tdrive/.env` :

```env
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

### 2. Configuration Keycloak

Sur votre serveur Keycloak (port 3005), créer un client :

```
Client ID: ryvie-rdrive
Client Protocol: openid-connect
Access Type: confidential
Client Secret: rdrive-secret-change-in-production

Valid Redirect URIs:
  - http://10.128.255.101:3010/api/v1/oauth/callback
  - http://100.104.214.194:3010/api/v1/oauth/callback
  - http://ryvie.local:3010/api/v1/oauth/callback
  - http://localhost:3010/api/v1/oauth/callback

Web Origins: *
```

## 🚀 Démarrage

### 1. Redémarrer les services

```bash
cd /data/apps/Ryvie-rDrive/tdrive
docker-compose down
docker-compose up -d
```

### 2. Vérifier les logs

```bash
# Logs du backend
docker-compose logs -f node

# Rechercher les logs OAuth
docker-compose logs node | grep -i oauth
```

### 3. Tester l'intégration

```bash
# Vérifier que le service OAuth est accessible
curl http://100.104.214.194:4000/api/v1/oauth/config

# Devrait retourner :
# {
#   "enabled": true,
#   "buttonText": "Se connecter avec Ryvie",
#   "autoLaunch": true,
#   "issuerUrl": "http://ryvie.local:3005/realms/ryvie"
# }
```

## 🎯 Fonctionnement du lancement automatique

### Avec `OAUTH_AUTO_LAUNCH=true`

1. **Utilisateur arrive sur la page de login** (`/login`)
2. **Le composant `OAuthAutoLaunch` se charge**
3. **Vérification automatique** :
   - OAuth est-il activé ? (`OAUTH_ENABLED=true`)
   - Auto-launch est-il activé ? (`OAUTH_AUTO_LAUNCH=true`)
   - Est-ce qu'on revient d'une erreur OAuth ? (évite la boucle)
4. **Si toutes les conditions sont remplies** :
   - Affichage d'un spinner "Redirection vers le système d'authentification..."
   - Appel à `/api/v1/oauth/authorize`
   - Redirection automatique vers Keycloak
5. **Utilisateur s'authentifie sur Keycloak**
6. **Callback vers rDrive** (`/api/v1/oauth/callback`)
7. **Session créée et redirection vers l'application**

### Avec `OAUTH_AUTO_LAUNCH=false`

1. **Utilisateur arrive sur la page de login**
2. **Affichage du formulaire classique** (email/mot de passe)
3. **Affichage d'un bouton OAuth** : "Se connecter avec Ryvie"
4. **Utilisateur clique sur le bouton OAuth**
5. **Flux OAuth démarre manuellement**

## 🔄 Flux OAuth avec issuerUrl dynamique

### Exemple avec IP NetBird (100.104.214.194)

```
1. Client accède à http://100.104.214.194:3010/login
   ↓
2. Frontend charge la config OAuth
   GET http://100.104.214.194:4000/api/v1/oauth/config
   ↓
3. OAuthAutoLaunch détecte autoLaunch=true
   ↓
4. Frontend appelle authorize
   GET http://100.104.214.194:4000/api/v1/oauth/authorize?redirectUri=...
   ↓
5. Backend extrait hostname "100.104.214.194"
   Construit issuerUrl = http://100.104.214.194:3005/realms/ryvie
   ↓
6. Backend fait OpenID Discovery
   GET http://100.104.214.194:3005/realms/ryvie/.well-known/openid-configuration
   ↓
7. Backend génère l'URL d'autorisation
   http://100.104.214.194:3005/realms/ryvie/protocol/openid-connect/auth?...
   ↓
8. Frontend redirige vers Keycloak
   ↓
9. Utilisateur s'authentifie sur Keycloak
   ↓
10. Keycloak callback
    GET http://100.104.214.194:4000/api/v1/oauth/callback?code=...&state=...
    ↓
11. Backend extrait hostname "100.104.214.194"
    Construit issuerUrl = http://100.104.214.194:3005/realms/ryvie
    ↓
12. Backend échange le code contre un token
    POST http://100.104.214.194:3005/realms/ryvie/protocol/openid-connect/token
    ↓
13. Backend récupère le profil utilisateur
    GET http://100.104.214.194:3005/realms/ryvie/protocol/openid-connect/userinfo
    ↓
14. Backend crée/met à jour l'utilisateur dans rDrive
    ↓
15. Backend retourne le profil et crée la session
    ↓
16. Frontend redirige vers l'application
```

## 🔒 Sécurité

### Points importants

1. **issuerUrl dynamique** : Construit automatiquement en fonction du hostname du client
2. **Fallback robuste** : Utilise `OAUTH_ISSUER_URL` par défaut en cas d'erreur
3. **Validation PKCE** : Code challenge/verifier pour sécuriser le flux
4. **State validation** : Protection contre les attaques CSRF
5. **Cookies sécurisés** : Stockage des tokens dans des cookies HTTP-only

### En production

```env
# Utiliser HTTPS
OAUTH_ISSUER_URL=https://ryvie.local:3005/realms/ryvie

# Changer le client secret
OAUTH_CLIENT_SECRET=votre-secret-securise-tres-long-et-aleatoire

# Configurer les redirect URIs strictes dans Keycloak
# Ne pas utiliser de wildcards
```

## 🐛 Debugging

### Problème : OAuth ne démarre pas automatiquement

**Vérifier** :
```bash
# 1. Configuration OAuth
curl http://100.104.214.194:4000/api/v1/oauth/config

# 2. Logs frontend (dans la console du navigateur)
# Rechercher : "OAuth config loaded" ou "Auto-launching OAuth flow"

# 3. Logs backend
docker-compose logs node | grep -i "oauth"
```

### Problème : Boucle de redirection

**Cause** : OAuth échoue et redirige vers login, qui relance OAuth

**Solution** : Le composant `OAuthAutoLaunch` détecte le paramètre `?fromOAuthError=true` pour éviter la boucle

### Problème : "Error in OAuth discovery"

**Vérifier** :
```bash
# Keycloak est-il accessible ?
curl http://100.104.214.194:3005/realms/ryvie/.well-known/openid-configuration

# Depuis le container Node
docker-compose exec node curl http://100.104.214.194:3005/realms/ryvie/.well-known/openid-configuration
```

### Problème : "State mismatch"

**Cause** : Le state OAuth ne correspond pas (problème de cookies)

**Solution** :
- Vérifier que les cookies sont activés dans le navigateur
- Vérifier que le domaine des cookies est correct
- Vider les cookies et réessayer

## 📊 Logs utiles

### Backend

```
[DEBUG] Starting OpenID Discovery for: http://100.104.214.194:3005/realms/ryvie
[DEBUG] Using dynamic issuerUrl for authorize: http://100.104.214.194:3005/realms/ryvie
[DEBUG] Generated authorization URL: http://100.104.214.194:3005/realms/ryvie/protocol/openid-connect/auth?...
[DEBUG] OpenID Discovery completed
[DEBUG] Token exchange successful
[INFO] OAuth callback successful for user: user@example.com
```

### Frontend (Console navigateur)

```
OAuth config loaded: {enabled: true, autoLaunch: true, ...}
Auto-launching OAuth flow
Starting OAuth authorization with redirectUri: http://100.104.214.194:3010/api/v1/oauth/callback
OAuth authorization URL received: http://100.104.214.194:3005/realms/ryvie/protocol/openid-connect/auth?...
Redirecting to OAuth provider
```

## 🎨 Personnalisation

### Changer le texte du bouton OAuth

```env
OAUTH_BUTTON_TEXT=Connexion SSO Ryvie
```

### Désactiver le lancement automatique

```env
OAUTH_AUTO_LAUNCH=false
```

L'utilisateur verra alors un bouton "Se connecter avec Ryvie" sur la page de login.

### Personnaliser le style du bouton OAuth

Modifier dans `login-view.jsx` :

```jsx
<Button
  id="oauth_login_btn"
  type="button"
  className="medium full_width"
  style={{ 
    marginBottom: 12, 
    backgroundColor: '#4285f4',  // Couleur personnalisée
    color: 'white',
    borderRadius: '8px',
    fontSize: '16px'
  }}
  ...
>
```

## 📝 Checklist de déploiement

- [ ] Variables d'environnement OAuth ajoutées dans `.env`
- [ ] Client Keycloak créé avec le bon `client_id` et `client_secret`
- [ ] Redirect URIs configurées dans Keycloak
- [ ] Service redémarré : `docker-compose restart`
- [ ] Configuration OAuth accessible : `curl .../api/v1/oauth/config`
- [ ] Keycloak accessible depuis le container : `docker-compose exec node curl ...`
- [ ] Test de connexion OAuth réussi
- [ ] Logs vérifiés (pas d'erreurs OAuth)
- [ ] En production : HTTPS activé et client secret changé

## 🎉 Résultat final

Avec `OAUTH_AUTO_LAUNCH=true` :
- ✅ L'utilisateur arrive sur `/login`
- ✅ Redirection automatique vers Keycloak (spinner affiché)
- ✅ Authentification sur Keycloak
- ✅ Retour automatique vers rDrive
- ✅ Session créée, utilisateur connecté

Avec `OAUTH_AUTO_LAUNCH=false` :
- ✅ L'utilisateur arrive sur `/login`
- ✅ Formulaire classique + bouton OAuth affiché
- ✅ Clic sur "Se connecter avec Ryvie"
- ✅ Flux OAuth démarre
- ✅ Session créée, utilisateur connecté

## 📚 Documentation complémentaire

- `OAUTH_ENV_VARIABLES.md` - Variables d'environnement détaillées
- `OAUTH_DYNAMIC_ISSUER_IMPLEMENTATION.md` - Détails techniques de l'implémentation
- Configuration Keycloak : https://www.keycloak.org/docs/latest/server_admin/
- OpenID Connect : https://openid.net/connect/

## 🆘 Support

En cas de problème :
1. Vérifier les logs : `docker-compose logs -f node`
2. Vérifier la configuration : `curl .../api/v1/oauth/config`
3. Vérifier Keycloak : `curl .../realms/ryvie/.well-known/openid-configuration`
4. Consulter la documentation dans `/Documentation/`
