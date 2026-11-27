# 0019. Respaldo diario y restauración

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

RNF-13 exige poder recuperar la base y las evidencias. La base guarda el SHA-256 de cada evidencia, no el contenido (ADR 0013), así que ambas cosas deben respaldarse juntas. Son unos 10 usuarios y 100 registros al año: no hace falta replicación ni respaldo continuo.

## Decisión

- **Servicio `respaldo` en Compose**, con la misma imagen que `bd` (`postgres:16.16-alpine`) para que `pg_dump` sea de la versión del servidor. Solo está en la red `datos`, monta `evidencias` en solo lectura y escribe en su propio volumen `respaldos`. Usa el rol `ipss_migrador`, sin roles nuevos.
- **Planificador propio** (`infra/respaldo/programar.sh`), no `crond`: respalda a las 03:00 hora de Santiago y recalcula la espera cada hora, así sigue bien los cambios de horario. Un respaldo fallido se reintenta el mismo día (3 intentos, uno cada 30 minutos); solo un éxito cierra el día. Un reinicio dentro de los 5 minutos posteriores a la hora no repite un respaldo que ya existe. `HORA_RESPALDO` y `DIAS_RETENCION` existen para pruebas y ajustes.
- **Un respaldo** (`respaldar.sh`) es un directorio `AAAA-MM-DD_HHMM` con `bd.dump` (formato custom, comprobado con `pg_restore --list`), `evidencias.tar` (sin `.entrantes`), `SHA256SUMS` y `manifiesto.txt`. Se arma en un directorio temporal y se renombra al final. Primero se vuelca la base y después se empaquetan los archivos, de modo que toda fila del volcado tiene su archivo.
- **Retención de 14 días**: se borran los directorios más viejos al terminar cada respaldo.
- **Restauración** (`restaurar.sh`, servicio `restaurar` bajo el perfil `restauracion`): verifica `SHA256SUMS`, corre `pg_restore --clean --if-exists --single-transaction` como `ipss_migrador` y desempaqueta las evidencias. Triggers e índices se crean al final del volcado, así que la carga no dispara el correlativo ni los historiales; los permisos de `ipss_api` viajan en el volcado. Después de restaurar, el mismo script revoca (`UPDATE`, nunca `DELETE`) todos los refresh tokens vigentes: el volcado trae el estado de la fecha del respaldo y una sesión cerrada después volvería a valer.
- **Seguridad del contenedor**: sin sistema de archivos raíz escribible, `no-new-privileges` y todas las capacidades fuera. Corre como root porque las evidencias son de `node` con permisos 0640 y `postgres` no las leería; solo conserva `DAC_READ_SEARCH`. Correr como uid 1000 leería las evidencias, pero el volumen `respaldos` nace con dueño root y no podría escribir en él; la alternativa sin root es una imagen derivada de `postgres` con `/respaldos` creado y entregado a ese usuario. `restaurar` agrega `CHOWN`, `DAC_OVERRIDE` y `FOWNER` y existe solo durante la restauración.
- **Prueba** (`npm run test:respaldo`): levanta la pila completa en un proyecto propio, siembra, deja que el planificador respalde, destruye la base y las evidencias, restaura y compara conteos, hash por tabla, permisos, triggers y descargas byte a byte. También cubre un respaldo dañado (no toca la base), la revocación de sesiones, una inserción real como `ipss_api`, la retención, el healthcheck y el reintento tras una falla.

## Consecuencias

- **Los respaldos viven en el mismo servidor** que los datos: no protegen contra la pérdida del equipo. TI debe copiar el volumen `respaldos` fuera del servidor con su propio mecanismo.
- **Los volcados no van cifrados** y contienen datos de los usuarios y hashes de contraseña; quien lea el volumen lee todo. La copia externa debe protegerse al menos con permisos de acceso o cifrado de disco.
- El healthcheck (`salud.sh`) usa estado persistente del volumen: queda *unhealthy* si existe la marca `.ultimo-fallo`, si el respaldo más nuevo tiene más de 26 horas o si el planificador no da señales; una instalación nueva tiene 26 horas de plazo desde su primer arranque. Un reinicio no borra una falla. Nada envía avisos, así que TI debe mirar `docker compose ps`.
- Tras una restauración **todos los usuarios deben volver a iniciar sesión**.
- Se pierde como máximo un día de trabajo (desde las 03:00).
- Restaurar: (1) elegir el directorio en `respaldos`; (2) `docker compose stop api`; (3) `docker compose --profile restauracion run --rm restaurar AAAA-MM-DD_HHMM`; (4) `docker compose up -d --wait`; (5) probar ingreso (cada usuario debe iniciar sesión de nuevo), panel y una descarga. Si el volumen de la base se perdió, `up` primero recrea el esquema vacío con `migrar` y la restauración lo reemplaza.
