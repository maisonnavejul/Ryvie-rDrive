---
description: Documentation complète sur l'intégration OnlyOffice dans Twake Drive
---

# 📝 Intégration OnlyOffice

## Vue d'ensemble

OnlyOffice est intégré à Twake Drive via un connecteur dédié qui permet l'édition et la prévisualisation de documents bureautiques directement dans le navigateur. Cette intégration offre une expérience fluide aux utilisateurs pour travailler avec des fichiers Microsoft Office et OpenDocument sans quitter l'interface de Twake Drive.

## Architecture du système

L'intégration OnlyOffice dans Twake Drive implique trois composants principaux :

1. **Interface utilisateur Twake Drive** : Frontend qui affiche les documents et lance l'éditeur OnlyOffice
2. **Connecteur OnlyOffice** : Service intermédiaire qui gère la communication entre Twake Drive et le serveur OnlyOffice
3. **Serveur de documents OnlyOffice** : Service qui effectue le rendu et permet l'édition des documents

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│                  │      │                  │      │                  │
│  Twake Drive UI  │◄────►│    Connecteur    │◄────►│ Serveur OnlyOffice│
│                  │      │    OnlyOffice    │      │                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

## Flux de travail

### Création d'un nouveau document

1. L'utilisateur clique sur "Créer un document" dans l'interface Twake Drive
2. Le navigateur télécharge un modèle vide depuis les assets statiques du connecteur
3. Le fichier est créé dans Twake Drive comme tout fichier normal
4. L'utilisateur peut ensuite ouvrir le document pour l'éditer

### Édition ou prévisualisation d'un document

1. L'utilisateur clique sur un document compatible (docx, xlsx, etc.)
2. Twake Drive génère un JWT pour l'utilisateur actuel
3. Le navigateur ouvre un iframe pointant vers le connecteur OnlyOffice
4. Le connecteur charge le client DocsAPI d'OnlyOffice avec les URL de lecture/écriture
5. L'éditeur OnlyOffice se charge et affiche le document
6. Les modifications sont sauvegardées via le connecteur

### Téléchargement de document

Lors du téléchargement d'un document édité avec OnlyOffice :

1. Le frontend utilise le système de téléchargement sécurisé avec JWT et cookies
2. Des notifications informent l'utilisateur de la progression :
   - "Préparation du document pour téléchargement..."
   - "Document téléchargé avec succès"
3. Le nom du fichier d'origine est préservé grâce à l'extraction des en-têtes Content-Disposition

## Sécurité

### Authentification

L'intégration OnlyOffice utilise plusieurs mécanismes de sécurité :

1. **JWT pour l'authentification utilisateur** :
   - Tokens JWT générés par Twake Drive pour authentifier les demandes
   - Les jetons incluent des informations sur l'utilisateur et ses permissions

2. **Communication sécurisée entre services** :
   - Le connecteur s'authentifie auprès de Twake Drive avec un ID et une clé secrète
   - Les communications entre le connecteur et OnlyOffice sont également sécurisées

3. **Proxy sécurisé** :
   - Toutes les requêtes passent par le backend pour éviter l'exposition directe des endpoints

## Configuration

### Variables d'environnement du connecteur

```
SERVER_PORT=5000
SERVER_PREFIX=/plugins/onlyoffice/
CREDENTIALS_ENDPOINT=http://backend/
ONLY_OFFICE_SERVER=https://onlyoffice/
CREDENTIALS_ID=tdrive_onlyoffice
CREDENTIALS_SECRET=apisecret
```

### Configuration du backend

```json
{
  "applications": {
    "plugins": [
      {
        "id": "tdrive_onlyoffice",
        "internal_domain": "http://plugins_onlyoffice:5000/",
        "external_prefix": "/plugins/onlyoffice/",
        "api": {
          "private_key": "apisecret"
        },
        "display": {
          "tdrive": {
            "version": 1,
            "files": {
              "editor": {
                "preview_url": "/plugins/onlyoffice/?preview=1",
                "edition_url": "/plugins/onlyoffice/",
                "empty_files": [
                  {
                    "url": "/plugins/onlyoffice/assets/empty.docx",
                    "filename": "Untitled.docx",
                    "name": "ONLYOFFICE Word Document"
                  },
                  // ...autres modèles
                ],
                "extensions": [
                  "xlsx", "pptx", "docx", "xls", "ppt", "doc",
                  "odt", "ods", "odp", "txt", "html", "csv"
                ]
              }
            }
          }
        },
        "identity": {
          "code": "only_office",
          "name": "Only Office",
          "icon": "/plugins/onlyoffice/assets/logo.png",
          "description": "Éditeur de documents bureautiques intégré",
          "website": "http://twake.app/"
        }
      }
    ]
  }
}
```

## Intégration avec le système de téléchargement

Le connecteur OnlyOffice s'intègre avec le système de téléchargement amélioré de Twake Drive de plusieurs façons :

1. **URL de téléchargement sécurisées** :
   - Les URLs de téléchargement générées incluent l'authentification JWT
   - Les téléchargements utilisent la même infrastructure d'authentification que les téléchargements directs

2. **Notifications de téléchargement** :
   - Les notifications "Préparation..." et "Téléchargement terminé" s'appliquent également aux documents OnlyOffice
   - L'expérience utilisateur est cohérente entre tous les types de fichiers

3. **Préservation du nom de fichier** :
   - Le système extrait les noms de fichiers depuis les en-têtes pour les documents OnlyOffice également
   - Cela garantit que les fichiers téléchargés conservent leurs noms originaux

## Flux de données complet

### Édition et sauvegarde

```
┌─────────┐          ┌──────────┐          ┌────────────┐          ┌─────────────┐
│         │ 1. Ouvre │          │ 2. Charge│            │ 3. Charge│             │
│Utilisateur─────────► Frontend ├──────────►Connecteur  ├──────────►Serveur      │
│         │ document │          │ iframe   │ OnlyOffice │ éditeur  │ OnlyOffice  │
└────┬────┘          └────┬─────┘          └─────┬──────┘          └──────┬──────┘
     │                     │                     │                        │
     │ 4. Édite            │                     │                        │
     ├────────────────────────────────────────────────────────────────────┘
     │                     │                     │                        │
     │                     │                     │                        │
     │                     │                     │ 5. Sauvegarde          │
     │                     │                     ◄────────────────────────┘
     │                     │                     │
     │                     │ 6. Mise à jour      │
     │                     ◄─────────────────────┘
     │                     │
     │ 7. Document mis à   │
     │    jour affiché     │
     ◄─────────────────────┘
```

### Téléchargement

```
┌─────────┐          ┌──────────┐          ┌────────────┐          ┌─────────────┐
│         │1.Demande │          │2.Requête │            │          │             │
│Utilisateur─────────►Frontend  ├──────────►Backend API ├──────────►  Storage    │
│         │télécharger│          │authentifiée         │          │   Service    │
└────┬────┘          └────┬─────┘          └─────┬──────┘          └──────┬──────┘
     │                     │                     │                        │
     │                     │ 3.Affiche           │                        │
     │                     │   notification      │                        │
     │                     │   "Préparation..."  │                        │
     │                     │                     │                        │
     │                     │                     │ 4.Récupère             │
     │                     │                     │  fichier               │
     │                     │                     ◄────────────────────────┘
     │                     │                     │
     │                     │ 5.Fichier +         │
     │                     │   Content-          │
     │                     │   Disposition       │
     │                     ◄─────────────────────┘
     │                     │
     │ 6.Téléchargement    │
     │   avec notification │
     │   "Terminé"         │
     ◄─────────────────────┘
```

## Extensions de fichiers supportées

Le connecteur OnlyOffice permet de travailler avec de nombreux formats de documents :

- **Traitement de texte** : docx, doc, odt, txt, html
- **Tableurs** : xlsx, xls, ods, csv
- **Présentations** : pptx, ppt, odp

## Défis techniques et solutions

### Problème : Synchronisation des modifications

**Solution** : Utilisation du système de callbacks d'OnlyOffice pour mettre à jour les fichiers quand tous les clients se déconnectent d'une session d'édition.

### Problème : Authentification entre services

**Solution** : Mise en place d'un système d'authentification basé sur JWT avec renouvellement périodique des tokens pour maintenir les sessions sécurisées.

### Problème : Téléchargement sécurisé

**Solution** : Implémentation d'un système de téléchargement avec double authentification (JWT + cookies) et notifications utilisateur pour une meilleure expérience.

## Limitations connues

1. **Édition collaborative** : Des limitations peuvent survenir lors de l'édition simultanée par de nombreux utilisateurs.
2. **Formats spécifiques** : Certaines fonctionnalités avancées de formatage peuvent ne pas être prises en charge.
3. **Performance** : L'édition de documents très volumineux peut entraîner une baisse de performance.

## Futurs développements

- Amélioration de l'intégration des commentaires et des suggestions
- Support de formats de fichiers supplémentaires
- Intégration plus profonde avec les fonctionnalités de partage de Twake Drive
- Optimisation des performances pour les documents volumineux

## Ressources additionnelles

- [Documentation API OnlyOffice](https://api.onlyoffice.com/editors/howitworks)
- [Code source du connecteur](https://github.com/linagora/twake-drive/tree/main/tdrive/connectors/onlyoffice-connector)
- [Configuration du serveur OnlyOffice](https://helpcenter.onlyoffice.com/installation/docs-community-deploy-docker.aspx)
