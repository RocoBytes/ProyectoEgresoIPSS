#!/bin/sh
# Planificador del respaldo diario. Es el proceso principal del servicio `respaldo`.
#
# No usa crond porque busybox crond exige root con todas sus capacidades; este bucle corre con las
# mínimas (ver compose.yaml) y se ajusta solo a los cambios de horario de Santiago: en vez de dormir
# 24 horas de una vez, duerme como máximo una hora y vuelve a calcular cuánto falta con el reloj local.
#
# Un respaldo fallido se reintenta el mismo día (MAX_INTENTOS veces, cada REINTENTO_SEGUNDOS). Solo un
# respaldo exitoso cierra el día. El estado que debe sobrevivir a un reinicio (marca de falla, primer
# arranque, reintento pendiente) vive en el volumen de respaldos, no en /tmp: ver salud.sh.
#
# Variables: HORA_RESPALDO (HH:MM en hora de Santiago, por defecto 03:00), REINTENTO_SEGUNDOS (1800),
# MAX_INTENTOS (3) y TZ, que fija Compose.
set -eu

HORA="${HORA_RESPALDO:-03:00}"
DESTINO="${DIRECTORIO_RESPALDOS:-/respaldos}"
REINTENTO="${REINTENTO_SEGUNDOS:-1800}"
MAX_INTENTOS="${MAX_INTENTOS:-3}"
# Si el contenedor arranca dentro de esta ventana (en segundos) tras la hora fijada, respalda igual.
VENTANA=300

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') [respaldo] $*"; }

case "$HORA" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *) log "HORA_RESPALDO debe tener la forma HH:MM (24 horas) y es '$HORA'" >&2; exit 1 ;;
esac
entero_positivo() {
  case "$2" in
    '' | *[!0-9]* | 0) log "$1 debe ser un entero mayor que cero y es '$2'" >&2; exit 1 ;;
  esac
}
entero_positivo REINTENTO_SEGUNDOS "$REINTENTO"
entero_positivo MAX_INTENTOS "$MAX_INTENTOS"

# `$((08))` falla en sh porque lee octal: se quita el cero inicial.
sin_cero() { v="${1#0}"; echo "${v:-0}"; }

segundos_del_dia() {
  h=$(date +%H); m=$(date +%M); s=$(date +%S)
  echo $(( $(sin_cero "$h") * 3600 + $(sin_cero "$m") * 60 + $(sin_cero "$s") ))
}

objetivo=$(( $(sin_cero "${HORA%:*}") * 3600 + $(sin_cero "${HORA#*:}") * 60 ))

# Como proceso 1, sh ignora SIGTERM salvo que lo atrape; sin esto `docker stop` esperaría 10 s y mataría el contenedor.
trap 'log "Recibí la señal de término, salgo"; exit 0' TERM INT

# Instalación nueva: salud.sh da un plazo desde el primer arranque antes de exigir un respaldo.
[ -e "$DESTINO/.primer-arranque" ] || touch "$DESTINO/.primer-arranque"
# Lo lee salud.sh: si el bucle se detiene, el servicio figura como no saludable.
touch /tmp/latido

ultimo=""          # día cuya ocurrencia ya se abrió
pendiente=no       # hay un respaldo por hacer (o por reintentar)
intentos=0
siguiente=0        # época a partir de la cual toca el próximo intento

# Los reintentos pendientes se guardan en el volumen para sobrevivir a un reinicio, también fuera de la ventana.
ESTADO="$DESTINO/.reintento"
guardar_estado() { echo "$ultimo $intentos $siguiente" > "$ESTADO"; }

if [ -f "$ESTADO" ]; then
  nuevo=no
  for d in "$DESTINO"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9]; do
    [ -d "$d" ] && [ -n "$(find "$d" -maxdepth 0 -newer "$ESTADO")" ] && nuevo=si
  done
  if [ "$nuevo" = si ] || [ -n "$(find "$ESTADO" -mmin +1440)" ]; then
    # Un respaldo posterior lo resolvió, o el reintento es de hace más de un día y ya no corresponde.
    rm -f "$ESTADO"
  elif read -r e_ultimo e_intentos e_siguiente < "$ESTADO" && case "$e_intentos$e_siguiente" in '' | *[!0-9]*) false ;; esac; then
    ultimo="$e_ultimo"; intentos="$e_intentos"; siguiente="$e_siguiente"; pendiente=si
    log "Retomo un reintento pendiente: van $intentos de $MAX_INTENTOS intentos"
  else
    rm -f "$ESTADO"
  fi
fi

# Un reinicio dentro de la ventana (actualización, `docker compose up`) no debe repetir el respaldo que ya se hizo hoy.
if [ "$pendiente" = no ] && ls -d "$DESTINO/$(date +%F)"_[0-9][0-9][0-9][0-9] > /dev/null 2>&1; then
  ultimo=$(date +%F)
  log "Ya hay un respaldo de hoy; no se repite"
fi
log "Planificador iniciado: un respaldo al día a las $HORA (zona ${TZ:-UTC}), se conservan ${DIAS_RETENCION:-14} días"

while :; do
  ahora=$(segundos_del_dia)
  epoca=$(date +%s)
  hoy=$(date +%F)
  desde=$(( (ahora - objetivo + 86400) % 86400 ))

  # Se abre la ocurrencia del día al entrar en la ventana.
  if [ "$desde" -lt "$VENTANA" ] && [ "$ultimo" != "$hoy" ]; then
    ultimo="$hoy"; pendiente=si; intentos=0; siguiente=0
  fi

  if [ "$pendiente" = si ] && [ "$epoca" -ge "$siguiente" ]; then
    intentos=$((intentos + 1))
    log "Intento $intentos de $MAX_INTENTOS"
    if sh /respaldo/respaldar.sh; then
      pendiente=no
      rm -f "$ESTADO"
    elif [ "$intentos" -ge "$MAX_INTENTOS" ]; then
      pendiente=no
      rm -f "$ESTADO"
      log "El respaldo falló $intentos veces; se reintenta mañana. El servicio queda no saludable hasta el próximo éxito." >&2
    else
      siguiente=$(( $(date +%s) + REINTENTO ))
      guardar_estado
      log "El respaldo falló; reintento en $REINTENTO s" >&2
    fi
    touch /tmp/latido
    continue
  fi

  falta=$(( (objetivo - ahora + 86400) % 86400 ))
  # Si ya se abrió la ocurrencia de hoy, `falta` es casi un día; a las HH:MM:00 exactas valdría 0 y se cuenta el día completo.
  [ "$falta" -eq 0 ] && falta=86400
  espera=$falta
  if [ "$pendiente" = si ]; then
    espera=$((siguiente - epoca))
    [ "$espera" -lt 1 ] && espera=1
  fi
  [ "$espera" -gt 3600 ] && espera=3600
  if [ "$pendiente" = si ]; then
    log "Reintento pendiente (van $intentos de $MAX_INTENTOS): el próximo intento es en $((siguiente - epoca)) s; vuelvo a revisar en $espera s"
  else
    log "Próximo respaldo a las $HORA, faltan $falta s; vuelvo a revisar en $espera s"
  fi
  touch /tmp/latido
  # `wait` deja pasar las señales de inmediato; un `sleep` en primer plano las retendría.
  sleep "$espera" &
  wait $! || true
done
