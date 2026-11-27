#!/bin/sh
# Un respaldo completo: base de datos y evidencias, con sumas de verificación.
#
# Deja /respaldos/AAAA-MM-DD_HHMM/ con:
#   bd.dump          pg_dump en formato custom, comprobado con pg_restore --list
#   evidencias.tar   los archivos de evidencias, sin la carpeta temporal .entrantes
#   SHA256SUMS       suma de ambos archivos (la usa restaurar.sh antes de tocar nada)
#   manifiesto.txt   fecha, versiones y conteos de las tablas principales
#
# Se escribe primero en un directorio temporal y se renombra al final: un respaldo a medias nunca
# tiene el nombre de uno válido. Sale con código distinto de cero ante cualquier falla.
#
# Variables (las fija compose.yaml): PGHOST, PGUSER, PGDATABASE y PGPASSWORD para la conexión;
# DIAS_RETENCION (por defecto 14), DIRECTORIO_RESPALDOS y DIRECTORIO_EVIDENCIAS.
# No imprime la clave ni datos de los registros.
set -eu

DESTINO="${DIRECTORIO_RESPALDOS:-/respaldos}"
ORIGEN="${DIRECTORIO_EVIDENCIAS:-/evidencias}"
DIAS="${DIAS_RETENCION:-14}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') [respaldo] $*"; }
fallar() { log "ERROR: $*" >&2; exit 1; }

case "$DIAS" in
  '' | *[!0-9]* | 0) fallar "DIAS_RETENCION debe ser un entero mayor que cero y es '$DIAS'" ;;
esac
[ -d "$ORIGEN" ] || fallar "no existe el directorio de evidencias $ORIGEN"
[ -d "$DESTINO" ] || fallar "no existe el directorio de respaldos $DESTINO"

nombre=$(date +%Y-%m-%d_%H%M)
final="$DESTINO/$nombre"
temporal="$DESTINO/.en-curso-$nombre"
[ ! -e "$final" ] || fallar "ya existe $final; espere un minuto y repita"

# Restos de un respaldo anterior que murió a medias (corte de luz, contenedor detenido).
rm -rf "$DESTINO"/.en-curso-*
mkdir "$temporal"

terminado=no
limpiar() { [ "$terminado" = si ] || rm -rf "$temporal"; }
trap limpiar EXIT

log "Respaldo $nombre: comienza"

# Primero la base y después los archivos: toda fila del volcado apunta a un archivo que ya estaba en disco
# (la API guarda el archivo antes de insertar la fila). Un archivo sin fila es un huérfano inofensivo.
pg_dump --format=custom --file="$temporal/bd.dump" || fallar "pg_dump falló"
pg_restore --list "$temporal/bd.dump" > /dev/null || fallar "el volcado no se puede leer con pg_restore --list"
log "Base de datos volcada ($(du -k "$temporal/bd.dump" | cut -f1) KiB)"

tar -C "$ORIGEN" --exclude ./.entrantes -cf "$temporal/evidencias.tar" . || fallar "tar de evidencias falló"
tar -tf "$temporal/evidencias.tar" > /dev/null || fallar "el tar de evidencias no se puede leer"
log "Evidencias empaquetadas ($(du -k "$temporal/evidencias.tar" | cut -f1) KiB)"

(cd "$temporal" && sha256sum bd.dump evidencias.tar > SHA256SUMS) || fallar "no se pudo calcular SHA256SUMS"

{
  echo "Respaldo: $nombre"
  echo "Generado: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "Cliente: $(pg_dump --version)"
  echo "Servidor: $(psql --no-psqlrc -At -c 'show server_version')"
  echo "Archivos de evidencias: $(tar -tf "$temporal/evidencias.tar" | grep -vc '/$')"
  echo "Filas por tabla:"
  psql --no-psqlrc -At -F ' ' -c "
    select 'usuario', count(*) from usuario union all
    select 'sesion', count(*) from sesion union all
    select 'evidencia', count(*) from evidencia union all
    select 'registro', count(*) from registro union all
    select 'historial_estado', count(*) from historial_estado union all
    select 'historial_cambio', count(*) from historial_cambio union all
    select 'version_malla', count(*) from version_malla" | sed 's/^/  /'
} > "$temporal/manifiesto.txt" || fallar "no se pudo escribir el manifiesto"

mv "$temporal" "$final"
terminado=si
log "Respaldo completo: $final"

# Retención: se borran los directorios con nombre de respaldo más viejos que DIAS días.
# `-mtime +N` cuenta días completos, así que N = DIAS-1 deja exactamente DIAS días de respaldos.
find "$DESTINO" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9]' \
  -mtime "+$((DIAS - 1))" | while read -r viejo; do
  rm -rf "$viejo"
  log "Borrado por retención ($DIAS días): $viejo"
done
exit 0
