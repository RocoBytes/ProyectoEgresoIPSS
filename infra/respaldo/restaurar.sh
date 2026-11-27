#!/bin/sh
# Restaura la base y las evidencias desde un respaldo hecho por respaldar.sh.
#
# Procedimiento (desde la carpeta que contiene compose.yaml y su .env):
#   1. Elegir el respaldo:   docker compose exec respaldo ls /respaldos
#   2. Detener la API:       docker compose stop api
#      Con la API viva sus conexiones bloquean el borrado de las tablas y la restauración no avanza.
#   3. Restaurar:            docker compose --profile restauracion run --rm restaurar AAAA-MM-DD_HHMM
#   4. Volver a levantar:    docker compose up -d --wait
#   5. Probar: iniciar sesión, abrir el panel y descargar una evidencia.
#      Tras una restauración TODOS los usuarios deben volver a iniciar sesión: el script revoca los
#      refresh tokens (ver más abajo).
#
# Qué hace, en este orden, y se detiene en la primera falla:
#   - comprueba SHA256SUMS y que el volcado se pueda leer, antes de tocar la base;
#   - pg_restore --clean --if-exists como ipss_migrador (dueño del esquema), pasado por psql en una sola
#     transacción junto con la revocación de tokens: una falla deja la base como estaba;
#   - revoca todos los refresh tokens vigentes (UPDATE de revocado_en, nunca DELETE): el volcado trae el
#     estado de la fecha del respaldo, y un token revocado después (por un cierre de sesión o por
#     seguridad) volvería a valer; así nadie conserva una sesión que ya se había cerrado;
#   - desempaqueta las evidencias en el volumen. No borra archivos que no estén en el respaldo.
#
# Los triggers (correlativo, protección de cerrados, historiales) y los índices van en la sección
# «post-data» del volcado: se crean después de cargar los datos, por eso la carga no los dispara y
# los correlativos y los historiales quedan tal como estaban. Los GRANT a ipss_api viajan en el volcado.
#
# Variables (las fija compose.yaml): PGHOST, PGUSER, PGDATABASE, PGPASSWORD.
set -eu

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') [restaurar] $*"; }
fallar() { log "ERROR: $*" >&2; exit 1; }

[ "$#" -eq 1 ] || fallar "uso: restaurar.sh AAAA-MM-DD_HHMM (nombre de un directorio dentro de /respaldos)"
case "$1" in
  /*) origen="$1" ;;
  *) origen="/respaldos/$1" ;;
esac
DESTINO_EVIDENCIAS="${DIRECTORIO_EVIDENCIAS:-/evidencias}"

for archivo in bd.dump evidencias.tar SHA256SUMS; do
  [ -f "$origen/$archivo" ] || fallar "falta $origen/$archivo"
done

log "Verificando sumas de $origen"
(cd "$origen" && sha256sum -c SHA256SUMS) || fallar "las sumas no coinciden: el respaldo está dañado, no se restaura nada"
pg_restore --list "$origen/bd.dump" > /dev/null || fallar "el volcado no se puede leer"

# pg_restore genera el SQL del volcado (mismo orden, con los triggers al final) y se le suma la revocación de
# sesiones; psql lo corre todo en UNA transacción con ON_ERROR_STOP: o queda restaurada y con las sesiones
# revocadas, o la base queda exactamente como estaba.
log "Restaurando la base de datos y revocando las sesiones (una sola transacción)"
guion=/tmp/restaurar.sql
pg_restore --clean --if-exists --file="$guion" "$origen/bd.dump" || fallar "pg_restore no pudo leer el volcado; no se cambió nada"
cat >> "$guion" <<'SQL'

-- El volcado trae el estado de la fecha del respaldo: un token revocado después volvería a valer.
-- El guion de pg_restore deja search_path vacío, por eso el esquema va explícito.
with t as (update public.refresh_token set revocado_en = now() where revocado_en is null returning 1)
  select count(*) as revocados from t \gset
\echo REVOCADOS :revocados
SQL
salida=$(psql --no-psqlrc -q -At -v ON_ERROR_STOP=1 --single-transaction --file="$guion") \
  || fallar "la restauración falló y no se cambió nada (una sola transacción). ¿Está detenida la API?"
rm -f "$guion"
revocados=$(echo "$salida" | sed -n 's/^REVOCADOS //p')
log "Refresh tokens revocados: $revocados (todos los usuarios deben iniciar sesión de nuevo)"

log "Restaurando las evidencias en $DESTINO_EVIDENCIAS"
tar -C "$DESTINO_EVIDENCIAS" -xf "$origen/evidencias.tar" || fallar "no se pudieron desempaquetar las evidencias"

log "Restauración completa. Levante la API y compruebe el ingreso, el panel y una descarga."
