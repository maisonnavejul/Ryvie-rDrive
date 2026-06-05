# rDrive — Architecture cible « same-origin » (fin du whack-a-mole d'URLs)

> But : supprimer **toute** la classe de bugs « URL absolue fabriquée en dur » (IP:port, `<host>:8090`,
> issuer codé en dur…) qui réapparaît à chaque feature (issuer, backend, callback OAuth, OnlyOffice).
> Statut : **implémenté + testé au niveau routage** sur la box (dev compose). Le rendu navigateur de
> l'éditeur OnlyOffice reste à confirmer côté UI.

---

## 1. La racine du problème

Chaque service fabrique son URL externe **en dur** (une IP:port, ou un host deviné `<req.host>:8090`).
Or il y a **3 façons d'accéder** à la box : IP LAN (`192.168.x:3010`), IP tunnel (`100.x:3010`),
domaine public (`rdrive-xxx.ryvie.fr`). Dès que l'URL d'accès change, le service pointe au mauvais
endroit → on corrige service par service, sans fin.

## 2. Le principe (un seul, qui règle tout)

**Une app ne connaît JAMAIS sa propre URL externe.** Elle la déduit de la requête entrante.

1. **Tout en même origine, via UN reverse-proxy** (le nginx du frontend, qui existe déjà). Il route
   chaque sous-service **par chemin**, sur le domaine par lequel tu es arrivé :

   | Chemin | Cible |
   |--------|-------|
   | `/api`, `/internal`, `/administration` | `node:4000` |
   | `/plugins/onlyoffice/` | connecteur `:5000` |
   | `/onlyoffice-ds/` | Document Server `:80` |
   | `/ws`, `/socket.io` | `node:4000` (WebSocket) |
   | `/auth` | Keycloak (déjà en place côté cluster) |

   → Le frontend et le connecteur utilisent des **URLs relatives / `window.location`**. Identique en
   `192.168.x:3010`, `100.x:3010` ou `rdrive-xxx.ryvie.fr` — « relatif » = « là où tu es ».

2. **Pour les rares URLs qui DOIVENT être absolues** (issuer OIDC, `redirect_uri`, URL du serveur
   OnlyOffice passée au navigateur), on les dérive de **`X-Forwarded-Proto` + `X-Forwarded-Host`** —
   jamais d'IP ni d'env codé en dur :

   ```ts
   const base = `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`;
   // issuer            = base + '/auth/realms/ryvie'
   // redirect_uri      = base + '/oauth-callback'
   // onlyoffice_server = base + '/onlyoffice-ds/'
   ```

> ⚠️ Derrière le proxy, l'en-tête `Host` reçu par le service = l'**upstream interne**
> (`host.docker.internal:5000`). Toujours préférer **`X-Forwarded-Host`** à `Host` pour dériver
> l'URL externe.

---

## 3. Changements par composant (exact)

### 3.1 nginx frontend — `docker/tdrive-frontend/site.conf` + `entrypoint.sh`
- **Ajout** de deux `location` (en gardant `X-Forwarded-Host $http_host` / `-Proto $scheme`) :
  - `location ~ ^/(ws|socket.io)(/|$)` → `${NODE_HOST}` avec upgrade WebSocket
    (`proxy_http_version 1.1`, `Upgrade`/`Connection`).
  - `location /onlyoffice-ds/` → `${ONLYOFFICE_DOCUMENT_SERVER_HOST}/` (slash final = strip du
    préfixe), upgrade WebSocket, `X-Forwarded-*`.
- `entrypoint.sh` : nouvelle variable `ONLYOFFICE_DOCUMENT_SERVER_HOST` (défaut `http://onlyoffice`)
  ajoutée à l'`envsubst` de `site.template`.
- **Compose** : optionnel — `ONLYOFFICE_DOCUMENT_SERVER_HOST=http://onlyoffice` sur le service
  `frontend` (sinon le défaut de l'entrypoint suffit, le DS est joignable comme `onlyoffice` sur
  `tdrive_default`).

### 3.2 config.js frontend — `frontend/public/config.js`
- **Remplacé** les 3 branches (local / IP / public) par **une seule config same-origin** :
  `BACKEND_URL`/`FRONTEND_URL` = `window.location.origin`, `WEBSOCKET_URL` = `…/ws`,
  `ONLYOFFICE_CONNECTOR_URL` = origin, `ONLYOFFICE_DOCUMENT_SERVER_URL` = origin + `/onlyoffice-ds`.
- **Supprimé** : les placeholders `__REACT_APP_*__`, la détection IP/privée, le cas `ryvie.local`.
  → Les `sed` correspondants dans `entrypoint.sh` deviennent sans effet (inutile de les retirer).

### 3.3 connecteur OnlyOffice — `connectors/onlyoffice-connector/src/controllers/browser-editor.controller.ts`
- **Remplacé** la dérivation `<host>:8090` / `<host>:5000` (+ cas `ryvie.local`/IP privée) par du
  same-origin dérivé de `X-Forwarded-Proto`/`-Host` :
  ```ts
  const host = req.get('x-forwarded-host') || req.get('host') || '';   // x-forwarded-host PRIORITAIRE
  const base = `${protocol}://${host}`;
  onlyoffice_server = base + '/onlyoffice-ds/';     // chargé par le navigateur (DocsAPI)
  connectorServerUrl = base + '/plugins/onlyoffice/'; // callback DS -> connecteur
  ```
- `getPrivateIPAddress()` n'est plus utilisée (laissée en place, inoffensive).

### 3.4 backend node — `src/services/oauth/{service,controller}.ts`  *(déjà fait précédemment)*
- `buildIssuerUrl()` et la reconstruction du `redirect_uri` dérivent déjà de l'hôte/`X-Forwarded-*`.
  Cohérent avec ce principe. Voir `SAME_ORIGIN` : aucune IP ni domaine codé en dur, pas de fallback.

### 3.5 Document Server — image `onlyoffice/documentserver` (stock)
- **Aucune modification d'image nécessaire** (cf. §4) : OnlyOffice sert sous sous-chemin car son
  `api.js` déduit sa base de sa propre URL de chargement.

---

## 4. OnlyOffice sous sous-chemin `/onlyoffice-ds/` — vérifié

Crainte initiale : le DS génère des URLs d'assets **root-absolues** (`/web-apps`, `/sdkjs`…) → 404
sous un sous-chemin. **Test sur la box (dev compose), résultats réels :**

| Test (`http://localhost:3010`) | Résultat |
|--------------------------------|----------|
| `/onlyoffice-ds/healthcheck` | `true` **200** (strip de préfixe OK) |
| `/onlyoffice-ds/web-apps/apps/api/documents/api.js` | **200** |
| Chemins root-absolus `"/web-apps"`,`"/sdkjs"` dans `api.js` | **aucun** → DocsAPI est *path-aware* |
| `/api/v1/oauth/config` | **200** (route `/api`) |
| `/ws` (sans upgrade) | atteint node (500, pas 404 nginx) |
| `/plugins/onlyoffice/` | atteint le connecteur (400 params) |

→ **Conclusion** : `api.js` se localise tout seul et charge ses assets sous `/onlyoffice-ds/`.
Le seul artefact root-absolu observé est la redirection cosmétique `/onlyoffice-ds/` → `/welcome/`
(**non utilisée par l'éditeur**).

### Le vrai point d'attention restant : le **callback DS → connecteur** (sauvegarde)
Le Document Server (côté serveur) POST le contenu sauvegardé vers `connectorServerUrl`
(= `base + /plugins/onlyoffice/`). Le conteneur DS doit pouvoir **joindre `base`** :
- **LAN** (`192.168.x:3010`) : le conteneur DS atteint l'hôte → OK.
- **Public** (`rdrive-xxx.ryvie.fr`) : le DS doit résoudre + sortir sur internet pour revenir à la box
  (ou split-DNS). À valider.

**Refinement recommandé** (plus robuste) : garder l'URL DS **navigateur** en same-origin externe,
mais router le **callback** par une URL **interne** (`http://<host-gateway>:5000/plugins/onlyoffice/`),
puisque DS et connecteur sont sur le même hôte Docker. À décider lors de l'application à l'image.

---

## 5. Ce qui reste à faire / à appliquer aux images

1. **Baker** les 4 changements ci-dessus (3.1–3.3 + 3.4 déjà fait) dans les images
   `rdrive-frontend` et `rdrive-onlyoffice-connector`, rebuild + push.
2. **Confirmer en navigateur** : ouvrir un document → l'éditeur OnlyOffice s'affiche (plus de
   mixed-content / `DocsAPI is not defined`), le document se charge, **et la sauvegarde** fonctionne
   (c'est le test du callback §4).
3. **Décider** du callback DS (same-origin externe vs interne host-gateway) selon le résultat du
   test public.
4. Le `.env` d'URLs publiques (`REACT_APP_*_URL`) devient **inutile** (config.js l'ignore), à part
   `OAUTH_PUBLIC_HOST` si on garde l'option issuer-public OIDC.

## 6. Bénéfice
Zéro IP, zéro domaine, zéro `.env` d'URLs. Une seule chose à configurer : « fais confiance au proxy »
(les `X-Forwarded-*`). Toute la classe de bugs disparaît, et une app tierce (Nextcloud…) se branche
de la même façon. C'est exactement le fonctionnement de Nextcloud / GitLab derrière un proxy.
