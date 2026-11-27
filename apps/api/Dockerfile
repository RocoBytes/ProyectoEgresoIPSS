# Una sola imagen sirve a los servicios `api` y `migrar` (ADR 0007).
# Se construye desde la raíz del repositorio: docker build -f apps/api/Dockerfile .

# ---- Construcción: compila TypeScript y genera el cliente de Prisma ----
FROM node:26.13.1-alpine AS construccion
WORKDIR /app

# Primero solo los manifiestos: mientras no cambien las dependencias, `npm ci` sale de la caché de capas.
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# @ipss/shared solo aporta tipos, pero tsc necesita su enlace en node_modules para resolverlos.
RUN npm ci -w @ipss/api -w @ipss/shared

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
# `generar` se ejecuta aparte de `build` para que su salida quede visible en el registro de construcción.
RUN npm run generar && npx tsc -p tsconfig.build.json

# ---- Ejecución: solo dependencias de producción ----
FROM node:26.13.1-alpine AS ejecucion
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# `prisma` es dependencia de producción a propósito: el servicio `migrar` ejecuta su CLI desde esta imagen.
# Su postinstall (@prisma/engines) descarga `schema-engine` aquí, durante la construcción, porque el
# contenedor `migrar` corre en una red interna y no tiene internet.
RUN npm ci --omit=dev -w @ipss/api && npm cache clean --force

# Falla la construcción si el motor de migraciones no quedó dentro de la imagen.
RUN ls -l /app/node_modules/@prisma/engines/schema-engine-* \
 && test -x /app/node_modules/.bin/prisma

COPY --from=construccion /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts

# Si el volumen naciera de un directorio inexistente, Docker lo crearía con dueño root y la primera
# carga de una evidencia fallaría con EACCES. Se crea con dueño `node` antes de declararlo.
RUN mkdir -p /datos/evidencias && chown node:node /datos/evidencias
VOLUME /datos/evidencias

USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
