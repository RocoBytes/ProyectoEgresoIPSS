# Instalación en el servidor

Guía para TI. Se instala con Docker Compose; no hace falta Node ni compilar nada en el servidor.

## Requisitos

- Linux con **Docker Engine y Compose v2** (`docker compose version`).
- **Puertos 80 y 443** libres en el servidor y un **nombre DNS** que apunte a él (por ejemplo `plataforma.instituto.example`). Caddy obtiene y renueva el certificado solo; para eso el servidor debe ser alcanzable desde internet en el 80 y el 443.
- Si el sitio va detrás de **Cloudflare** (opcional): el `Caddyfile` ya confía en sus rangos (`trusted_proxies`, tomados de https://www.cloudflare.com/ips-v4) para ver la IP real del usuario. Si cambian, hay que actualizar esa lista; sin ella, el límite de intentos de ingreso trata a todos como una sola conexión.
- **Docker publica los puertos saltándose `ufw`**: una regla de `ufw` no cierra un puerto que Compose publicó. Los únicos puertos publicados son el 80 y el 443 del proxy; la base y la API quedan en redes internas.

## Archivos

Copiar al servidor la carpeta `infra/` completa (incluye `compose.yaml`, `Caddyfile`, `bd/` y `respaldo/`). Las imágenes se descargan de GHCR.

## Variables

Se definen en `infra/.env` (copiar `infra/.env.ejemplo` y completar; el archivo no va al repositorio) o en el entorno. Si falta una obligatoria, `docker compose` se detiene con un mensaje.

| Variable | Obligatoria | Por defecto | Qué es |
| --- | --- | --- | --- |
| `DOMINIO` | sí | — | Nombre público, por ejemplo `plataforma.instituto.example`. |
| `GHCR_ORG` | sí | — | Organización dueña de las imágenes en GHCR, en minúsculas. |
| `VERSION` | sí | — | Etiqueta de las imágenes, por ejemplo `v1.0.0`. |
| `CLAVE_BD_SUPERUSUARIO` | sí | — | Clave del superusuario `postgres`. `openssl rand -hex 24` |
| `CLAVE_BD_MIGRADOR` | sí | — | Clave del rol `ipss_migrador`. `openssl rand -hex 24` |
| `CLAVE_BD_API` | sí | — | Clave del rol `ipss_api`. `openssl rand -hex 24` |
| `JWT_SECRETO` | sí | — | Secreto de firma de las sesiones. `openssl rand -hex 32` |
| `PUERTO_HTTP` | no | `80` | Puerto publicado para HTTP. |
| `PUERTO_HTTPS` | no | `443` | Puerto publicado para HTTPS. |
| `HORA_RESPALDO` | no | `03:00` | Hora del respaldo diario (Santiago). |
| `DIAS_RETENCION` | no | `14` | Días que se conservan los respaldos. |
| `REINTENTO_SEGUNDOS` | no | `1800` | Espera entre reintentos de un respaldo fallido. |
| `MAX_INTENTOS` | no | `3` | Intentos de respaldo por día. |

Las claves de la base se fijan al crear el volumen: cambiarlas después en el `.env` no las cambia dentro de PostgreSQL.

## Puesta en marcha

```sh
cd infra
docker compose up -d --wait
docker compose ps
```

Está bien cuando `migrar` terminó con código 0 (`Exited (0)`) y `proxy`, `web`, `api`, `bd` y `respaldo` figuran **healthy**. Abrir `https://<DOMINIO>`: aparece la pantalla de ingreso. `https://<DOMINIO>/api/salud` responde el estado de la API y la base.

### Catálogos

La plataforma parte vacía. Los catálogos (sectores, carreras, asignaturas, módulos y canales) se cargan desde una planilla Excel:

```sh
docker compose exec -T api node dist/cli/catalogos.js --plantilla - > catalogos.xlsx
# llenar catalogos.xlsx (la plantilla trae filas de ejemplo: reemplazarlas por las del IPSS)
docker compose exec -T api node dist/cli/catalogos.js - --prueba < catalogos.xlsx   # valida y muestra qué cambiaría; no escribe
docker compose exec -T api node dist/cli/catalogos.js - < catalogos.xlsx            # carga de verdad
```

La carga es una sola transacción: si la planilla tiene errores se informan todos y no se escribe nada. Repetirla no cambia nada.

### Usuarios

```sh
docker compose exec -T api node dist/cli/usuarios.js crear --correo ana.perez@instituto.cl --nombre "Ana Pérez" --rol DIRECTOR_SECTORIAL --sector "Tecnologías"
```

Roles: `DIRECTOR_SECTORIAL` (con `--sector`, repetible), `DIRECTOR_CARRERA` (con `--carrera`, repetible) y `ASEGURAMIENTO_CALIDAD`. El comando imprime la **clave temporal una sola vez**: entregarla por un canal seguro. Todavía no existe el cambio de clave por el usuario; para una clave nueva o un bloqueo, `usuarios restablecer-clave --correo ...`. También existen `desactivar`, `activar` y `listar`. Nada se borra: una cuenta se desactiva.

## Respaldos

- **Qué y dónde:** cada día a la hora de `HORA_RESPALDO` el servicio `respaldo` guarda en el volumen `respaldos` una carpeta `AAAA-MM-DD_HHMM` con la base (`bd.dump`), las evidencias (`evidencias.tar`) y sus sumas (`SHA256SUMS`). Se conservan `DIAS_RETENCION` días. Ver los respaldos: `docker compose exec respaldo ls /respaldos`.
- **Salud:** el servicio queda *unhealthy* si el último respaldo falló, si el más reciente tiene más de 26 horas o si el planificador no da señales. Nada envía avisos: revisar `docker compose ps` a diario o conectarlo a su monitoreo.
- **Copiar fuera del servidor:** los respaldos viven en el mismo equipo que los datos y no protegen contra su pérdida. TI debe copiar el volumen `respaldos` a otro lugar con su propio mecanismo. Los volcados **no van cifrados** y contienen hashes de contraseñas: protegerlos con permisos o cifrado de disco.
- **Restaurar:**
  1. Elegir la carpeta (comando de arriba).
  2. `docker compose stop api`.
  3. `docker compose --profile restauracion run --rm restaurar AAAA-MM-DD_HHMM` (verifica las sumas antes de tocar nada; si algo falla, la base queda como estaba).
  4. `docker compose up -d --wait`.
  5. Probar el ingreso, el panel y una descarga. **Todos los usuarios deben iniciar sesión de nuevo.** Se pierde, como máximo, el trabajo desde el último respaldo.

## Actualizar a una versión nueva

1. Cambiar `VERSION` en el `.env` (por ejemplo `v1.1.0`).
2. `docker compose pull`
3. `docker compose up -d --wait`

Las migraciones de base corren solas en el servicio `migrar` antes de que arranque la API. Conviene confirmar antes que existe un respaldo reciente. Para volver atrás, restaurar `VERSION` y, si hubo migraciones, el respaldo anterior.

## Registros y soporte

- `docker compose logs --tail 100 api` (también `proxy`, `web`, `bd`, `respaldo`, `migrar`). Los registros no llevan datos personales.
- Ante un error 500, la respuesta trae un `idPeticion`; anotarlo junto con la hora y buscarlo en los registros de `api`.
- Arquitectura y decisiones: `docs/adr/`. Contexto del proyecto: `docs/contexto-proyecto.md`.
