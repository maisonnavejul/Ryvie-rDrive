# ---------- First stage: build frontend ----------
FROM node:lts-alpine AS build

# Activer pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /tdrive-react

# Meilleur cache : d'abord les manifestes + lockfile
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copier le package.json racine (pour lire la version dans vite.config.ts)
COPY package.json /tdrive-root-package.json

# Copier les fichiers de config nécessaires pour le build Vite
COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/tailwind.config.js frontend/postcss.config.js ./
COPY frontend/index.html ./index.html
COPY frontend/public ./public

# Puis le code source (séparé pour meilleur cache)
COPY frontend/src ./src

# Optimisations pour accélérer le build
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096"

# Ensure a favicon.ico exists (fallback to PNG)
RUN [ -f public/favicon.ico ] || cp public/favicon.png public/favicon.ico || true

# Copie de l'env si présent (sinon ne pas casser le build)
RUN if [ -f src/app/environment/environment.ts.dist ]; then \
      cp src/app/environment/environment.ts.dist src/app/environment/environment.ts; \
    fi

# Build Vite (les URLs sont injectées au runtime via config.js, pas au build)
RUN pnpm run build

# Nettoyer pour réduire la taille de l'image
RUN rm -rf node_modules src

# ---------- Second stage: nginx ----------
FROM nginx:latest

# Ton script est en bash et utilise openssl → on s’assure qu’ils sont là
RUN apt-get update && apt-get install -y --no-install-recommends bash openssl && rm -rf /var/lib/apt/lists/*

# Chemins corrigés (plus de préfixe "tdrive/")
COPY docker/tdrive-frontend/nginx.conf /etc/nginx/nginx.conf
COPY docker/tdrive-frontend/site.conf /etc/nginx/sites-available/site.template
COPY docker/tdrive-frontend/redirect.conf /etc/nginx/sites-available/redirect
COPY docker/tdrive-frontend/entrypoint.sh /entrypoint.sh
COPY docker/tdrive-frontend/self-signed.sh /usr/local/bin/self-signed.sh

# Artifacts front
COPY --from=build /tdrive-react /tdrive-react

RUN chmod +x /entrypoint.sh /usr/local/bin/self-signed.sh && \
    rm -f /etc/nginx/conf.d/default.conf

# Ne pas passer "$DEV" ici (pas d'expansion en forme JSON)
ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 80
EXPOSE 443

