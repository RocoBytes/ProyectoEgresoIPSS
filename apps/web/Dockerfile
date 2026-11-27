# Se construye desde la raíz del repositorio: docker build -f apps/web/Dockerfile .

# ---- Construcción: Vite genera los archivos estáticos ----
FROM node:26.13.1-alpine AS construccion
WORKDIR /app
# Primero solo los manifiestos, para aprovechar la caché de capas.
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @ipss/web -w @ipss/shared

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @ipss/web

# ---- Ejecución: Caddy sirve solo archivos estáticos ----
FROM caddy:2.11.9-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=construccion /app/apps/web/dist /srv
