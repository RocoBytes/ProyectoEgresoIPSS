# 0007. Una imagen para la API y las migraciones

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Las migraciones corren en un servicio aparte, `migrar`, con el rol `ipss_migrador`; la API usa `ipss_api`, que no puede alterar el esquema. `migrar` está en la red interna `datos`, sin salida a internet, pero el CLI de Prisma descarga `schema-engine` al instalarse. El kit de validación del 11-11-2026 nunca levantó los contenedores, así que nada de esto estaba probado.

## Decisión

- **Una sola imagen, `ipss-api`, para `api` y `migrar`.** El rol migrador solo lo usa `migrar`, porque solo ese servicio recibe `DATABASE_URL_MIGRADOR`; la imagen no contiene claves. `prisma` es dependencia de producción a propósito, para que el CLI viaje en la imagen y `migrar` no descargue nada.
- **`schema-engine` queda dentro de la imagen en la construcción.** Prisma 7 lo guarda en `node_modules/@prisma/engines/schema-engine-<plataforma>`, descargado por el `postinstall` de `@prisma/engines` (aprobado en `allowScripts`, ADR 0008). El Dockerfile ejecuta `ls` sobre ese archivo justo después de `npm ci`, de modo que la construcción falla si falta. La prueba final fue aplicar la migración desde `migrar` en la red interna `datos`: terminó con código 0 sin internet.
- **`migrar` ejecuta `/app/node_modules/.bin/prisma` por ruta explícita**, nunca `npx`, que intentaría descargar el CLI si no lo resolviera.
- **`/datos/evidencias` pertenece a `node`.** El Dockerfile hace `mkdir` y `chown` antes de `VOLUME`; sin eso el volumen nace como root y la primera carga falla con EACCES. Se comprobó escribiendo en el volumen con el sistema de archivos raíz de solo lectura.
- **Las variables obligatorias fallan al instante.** `${VAR:?mensaje}` hace que `docker compose` se detenga con un mensaje en español si falta un secreto, en vez de arrancar con una clave vacía.
- **Imágenes con etiqueta exacta:** `node:26.13.1-alpine`, `postgres:16.16-alpine` y `caddy:2.11.9-alpine`. Dependabot propone actualizaciones con espera de 7 días.

## Consecuencias

- La imagen de la API pesa unos 880 MB porque incluye el CLI y los motores de Prisma (cerca de 170 MB) además de las dependencias de producción.
- `schema-engine` depende de la plataforma de construcción (`linux-musl-arm64` o `linux-musl-x64`): la imagen debe construirse en la arquitectura donde se ejecutará.
- Subir la versión de Prisma exige reconstruir la imagen para que traiga su `schema-engine`.
