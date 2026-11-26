# Validación del stack y de las reglas de base de datos

Material de la validación del 11 de noviembre de 2026. Es una prueba desechable, no el esqueleto del proyecto: sirve para repetir las pruebas en un computador con Docker y para copiar la migración SQL.

## Qué se ejecutó y con qué resultado

Los resultados completos están en `resultados.txt`.

- `api/test/reglas-bd.mjs`: 26 de 26 comprobaciones sobre PostgreSQL 16.15 con el rol de la API (permisos, CHECK de cierre y anulación, registro cerrado inmutable, historial escrito por trigger, correlativo anual bajo 200 inserciones concurrentes, cambio de año).
- `api/test/humo-api.mjs`: 11 de 12 sobre Node.js 26.13.0 con NestJS 11.2.9. La que falla muestra un defecto real: Multer entrega `Acta comité Ñuñoa.pdf` como `Acta comitÃ© ÃuÃ±oa.pdf`.
- `api/test/excel.mjs`: exceljs 4.4.0 con `uuid` forzado a 11.1.1 (deja `npm audit` en cero).
- `web/`: instalación, verificación de tipos y `vite build` del frontend con las versiones fijadas.
- `infra/compose.yaml`: validado con `docker compose config` (Compose 5.6.1).

## Qué no se pudo ejecutar

El entorno donde se preparó bloquea Docker Hub, GHCR, `binaries.prisma.sh` y la descarga de Caddy. Quedan sin probar:

- levantar los contenedores de `infra/compose.yaml`;
- `prisma generate` y `prisma migrate deploy` (la migración se aplicó con `psql`);
- `infra/Caddyfile` (no pasó por `caddy validate`).

## Cómo repetirlo

```sh
# Base desechable con los dos roles
docker run -d --name ipss-pg -p 55432:5432 -e POSTGRES_PASSWORD=dev \
  -v ./db/00_roles.sql:/docker-entrypoint-initdb.d/00_roles.sql:ro postgres:16-alpine

cd api && npm ci
DATABASE_URL_MIGRADOR=postgresql://ipss_migrador:migrador_dev@127.0.0.1:55432/ipss npx prisma migrate deploy
npx prisma generate            # primera vez que se ejecuta: confirma prisma.config.ts y el cliente generado
node test/reglas-bd.mjs        # requiere la base recién creada
npx tsc -p tsconfig.json && node test/humo-api.mjs
node test/excel.mjs

cd ../web && npm ci && npm run build

cd ../infra && docker compose --env-file .env.ejemplo config --quiet
docker run --rm -v ./Caddyfile:/etc/caddy/Caddyfile:ro -e DOMINIO=localhost caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile
```

## Archivos que conviene llevar al proyecto

- `api/prisma/migrations/20261111000000_init/migration.sql`, sección 2: las reglas que Prisma no expresa en `schema.prisma`.
- `db/00_roles.sql` (desarrollo) e `infra/bd/00_roles.sh` (contenedor): creación de los roles migrador y API.
- `infra/compose.yaml`: servicio `migrar` de una sola ejecución y red interna para la base.
