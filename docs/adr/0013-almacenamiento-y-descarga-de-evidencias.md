# 0013. Almacenamiento y descarga de evidencias

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Las evidencias (actas, fotos, mallas, respaldos de cierre) son archivos subidos por usuarios. Deben guardarse sin riesgo de ruta, validarse por lo que contienen, poder verificarse al descargarse y no quedar huérfanas si la transacción de base de datos falla. Hoy se guardan en disco local; más adelante podrían ir a un almacenamiento compatible con S3.

## Decisión

- Interfaz `AlmacenamientoEvidencias` (`incorporar`, `abrir`, `borrar`) con una sola implementación, `DiscoLocal`. Las rutas guardadas son siempre un UUID dentro de `DIRECTORIO_EVIDENCIAS` (obligatorio en producción); cualquier ruta que no sea un UUID se rechaza.
- Multer escribe en `.entrantes/` con nombre UUID, nunca con el del cliente. Tras validar, `incorporar` mueve el archivo con `rename` (atómico, mismo volumen). Si la transacción falla, se borran los archivos ya incorporados; los temporales se borran siempre.
- El tipo se decide por el contenido con `file-type` (acta: PDF; fotos: JPG o PNG; HEIC se detecta para dar un mensaje específico). El SHA-256 se calcula por stream y el nombre original se corrige de latin1 a UTF-8.
- Límites: 20 MB por archivo (413), 10 fotos más el acta, 1 MB por campo de texto y 100 MB en total por envío (tope del plan gratuito de Cloudflare). Caddy (413 sin cuerpo, observado en 2.11.9) y Cloudflare (su página de error) lo rechazan primero por Content-Length, sin mensaje de la API, así que la web avisa antes de enviar y traduce ese 413 al mensaje; la API responde 413 con mensaje antes de leer el cuerpo y es la autoridad cuando no hay proxy.
- La descarga es solo por la API y con sesión: primero se verifica el SHA-256 contra el disco leyendo por stream; si no coincide, 500 con un mensaje para el administrador y solo el id en el log. Después se entrega con `Content-Disposition: attachment`, `nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` y `Cache-Control: private, no-store`.

- El nombre original se limpia al guardarlo: sin caracteres de control (`\p{Cc}`), recortado y de a lo más 255 caracteres conservando la extensión. El nombre limpio es el que se guarda y el que aparece en los mensajes.
- La descarga abre el archivo UNA vez: se calcula el SHA-256 leyendo ese manejador y los bytes se envían desde el mismo manejador, así lo verificado es lo enviado aunque el archivo se cambie después. Las cabeceras se fijan solo tras verificar. Si el envío falla, se corta la conexión (`res.destroy()`), nunca se escribe un cuerpo de error y el log lleva solo el id de la evidencia.
- Al arrancar, `DiscoLocal` borra de `.entrantes/` los temporales de más de una hora (restos de una caída a mitad de una subida).
- Los archivos incorporados quedan con permisos `0640`.

## Consecuencias

- Pasar a S3 es agregar otra implementación de la interfaz; los casos de uso no cambian.
- Cada descarga lee el archivo dos veces (hash y envío, sobre el mismo manejador); con archivos de hasta 20 MB y unos 10 usuarios es aceptable.
- El directorio de evidencias debe respaldarse junto con la base: la base guarda el SHA-256, no el contenido.
