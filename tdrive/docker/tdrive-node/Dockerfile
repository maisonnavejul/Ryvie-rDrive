# Common node machine
FROM node:lts-alpine AS node-base

### Install system dependencies
RUN apk add --update-cache \
      ghostscript \
      graphicsmagick \
      curl \
      openldap-clients \
    && rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

# ---- Dependencies layer (cached unless package*.json changes) ----
FROM node-base AS deps

COPY backend/node/package*.json ./
RUN npm ci --legacy-peer-deps

# ---- Build stage ----
FROM deps AS build

COPY backend/node/ .
RUN npm run build

# ---- Test Stage ----
FROM deps AS test

COPY backend/node/ .

# ---- Production stage (slim) ----
FROM node-base AS production

COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/config ./config
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY backend/node/package*.json ./
COPY backend/node/bin ./bin

EXPOSE 4000
CMD ["npm", "run", "serve"]

# ---- Development Stage ----
FROM deps AS development

RUN npm install -g pino-pretty tsc-watch
COPY backend/node/ .

ENV NODE_ENV=development
CMD ["npm", "run", "dev:debug"]