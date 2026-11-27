#!/bin/sh
# Healthcheck del servicio `respaldo`. Sale con 0 si está sano y con 1 (y una razón en stdout) si no.
#
# Se decide con estado persistente del volumen de respaldos, no con /tmp: un reinicio no borra una falla.
#   - el planificador sigue vivo (toca /tmp/latido al menos cada hora);
#   - no hay marca .ultimo-fallo (respaldar.sh la deja al fallar y la quita al terminar bien);
#   - el respaldo completo más nuevo tiene menos de PLAZO_HORAS horas (24 más 2 de holgura por el cambio de horario
#     y el tiempo que tarda el respaldo). Sin ningún respaldo, se da ese mismo plazo desde el primer arranque
#     (.primer-arranque), para que una instalación nueva no nazca no saludable.
DESTINO="${DIRECTORIO_RESPALDOS:-/respaldos}"
PLAZO_HORAS=26
PLAZO_MIN=$((PLAZO_HORAS * 60))

no_sano() { echo "$*"; exit 1; }

[ -n "$(find /tmp/latido -mmin -90 2> /dev/null)" ] || no_sano "el planificador no da señales de vida"
[ ! -e "$DESTINO/.ultimo-fallo" ] || no_sano "el último respaldo falló ($(cat "$DESTINO/.ultimo-fallo"))"

ultimo=""
for directorio in "$DESTINO"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9]; do
  [ -d "$directorio" ] && ultimo="$directorio"
done

if [ -n "$ultimo" ]; then
  [ -n "$(find "$ultimo" -maxdepth 0 -mmin -$PLAZO_MIN)" ] || no_sano "el respaldo más nuevo ($ultimo) tiene más de $PLAZO_HORAS horas"
else
  [ -n "$(find "$DESTINO/.primer-arranque" -maxdepth 0 -mmin -$PLAZO_MIN 2> /dev/null)" ] || no_sano "no hay ningún respaldo y pasaron más de $PLAZO_HORAS horas desde el primer arranque"
fi
echo "sano"
