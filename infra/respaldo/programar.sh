#!/bin/sh
# Planificador del respaldo diario. Es el proceso principal del servicio `respaldo`.
#
# No usa crond porque busybox crond exige root con todas sus capacidades; este bucle corre con las
# mínimas (ver compose.yaml) y se ajusta solo a los cambios de horario de Santiago: en vez de dormir
# 24 horas de una vez, duerme como máximo una hora y vuelve a calcular cuánto falta con el reloj local.
#
# Variables: HORA_RESPALDO (HH:MM en hora de Santiago, por defecto 03:00) y TZ, que fija Compose.
set -eu

HORA="${HORA_RESPALDO:-03:00}"
# Si el contenedor arranca dentro de esta ventana (en segundos) tras la hora fijada, respalda igual.
VENTANA=300

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') [respaldo] $*"; }

case "$HORA" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *) log "HORA_RESPALDO debe tener la forma HH:MM (24 horas) y es '$HORA'" >&2; exit 1 ;;
esac

# `$((08))` falla en sh porque lee octal: se quita el cero inicial.
sin_cero() { v="${1#0}"; echo "${v:-0}"; }

segundos_del_dia() {
  h=$(date +%H); m=$(date +%M); s=$(date +%S)
  echo $(( $(sin_cero "$h") * 3600 + $(sin_cero "$m") * 60 + $(sin_cero "$s") ))
}

objetivo=$(( $(sin_cero "${HORA%:*}") * 3600 + $(sin_cero "${HORA#*:}") * 60 ))

# Como proceso 1, sh ignora SIGTERM salvo que lo atrape; sin esto `docker stop` esperaría 10 s y mataría el contenedor.
trap 'log "Recibí la señal de término, salgo"; exit 0' TERM INT

# Lo lee el healthcheck: si el bucle se detiene o el último respaldo falló, el servicio figura como no saludable.
touch /tmp/latido
ultimo=""
# Un reinicio dentro de la ventana (actualización, `docker compose up`) no debe repetir el respaldo que ya se hizo hoy.
if ls -d "${DIRECTORIO_RESPALDOS:-/respaldos}/$(date +%F)"_[0-9][0-9][0-9][0-9] > /dev/null 2>&1; then
  ultimo=$(date +%F)
fi
log "Planificador iniciado: un respaldo al día a las $HORA (zona ${TZ:-UTC}), se conservan ${DIAS_RETENCION:-14} días"

while :; do
  ahora=$(segundos_del_dia)
  hoy=$(date +%F)
  desde=$(( (ahora - objetivo + 86400) % 86400 ))

  if [ "$desde" -lt "$VENTANA" ] && [ "$ultimo" != "$hoy" ]; then
    ultimo="$hoy"
    if sh /respaldo/respaldar.sh; then
      rm -f /tmp/fallo
    else
      touch /tmp/fallo
      log "El respaldo falló; se reintenta mañana. Revise los mensajes anteriores." >&2
    fi
    touch /tmp/latido
    continue
  fi

  falta=$(( (objetivo - ahora + 86400) % 86400 ))
  # Si ya se respaldó dentro de la ventana, `falta` puede ser 0 solo a las HH:MM:00 exactas: se cuenta un día completo.
  [ "$falta" -eq 0 ] && falta=86400
  espera=$falta
  [ "$espera" -gt 3600 ] && espera=3600
  log "Próximo respaldo a las $HORA, faltan $falta s; vuelvo a revisar en $espera s"
  touch /tmp/latido
  # `wait` deja pasar las señales de inmediato; un `sleep` en primer plano las retendría.
  sleep "$espera" &
  wait $! || true
done
