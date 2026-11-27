# 0016. Cierre y anulación de registros

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Un registro abierto termina de dos maneras: se cierra con evidencia o se anula con un motivo. La base ya garantiza las invariantes (CHECK de cierre y de anulación, trigger que rechaza cambios sobre registros cerrados o anulados), y esas reglas no se tocaron. Falta decidir cómo las expone la API y qué valida ella.

## Decisión

- **Endpoints** (roles `DIRECTOR_SECTORIAL` y `DIRECTOR_CARRERA`, ambos responden 200 con `{ id, correlativo, estado }`):
  - `POST /api/registros/:id/cierre`, `multipart/form-data`: `datos` con el JSON `{ fechaEfectiva, comentario? }` y un archivo `evidencia`.
  - `POST /api/registros/:id/anulacion`, JSON `{ motivo }`.
- **Evidencia de cierre** en la tabla `evidencia` con `sesion_id` NULL: no pertenece a ninguna sesión. Se valida por contenido: PDF, JPG o PNG; HEIC tiene su propio aviso («Las fotos HEIC del iPhone hay que convertirlas a JPG antes de subirlas.»).
- **Fecha efectiva**: la valida solo la API (no posterior a hoy en Santiago, con el reloj inyectable, y no anterior a la fecha de la sesión), porque las reglas de la base no cambiaron. Comentario y motivo admiten hasta 2.000 caracteres; el motivo exige al menos 10 y un comentario en blanco se guarda como NULL.
- **Orden de comprobaciones**: 404, 403 (mismo mensaje que PATCH), 409 si el estado no es ABIERTO y recién entonces 400 por campo, todos juntos. Ante una carrera entre dos peticiones decide el trigger: la actualización va por `id` (no por `id` y estado), el 23514 se traduce a 409 (ADR 0006) y la transacción deshace la fila de evidencia.
- **Subida**: el interceptor de Multer pasa a una base con campos configurables (`acta` y `fotos` para sesiones, `evidencia` para el cierre), con los mismos límites, tope de 100 MB por `Content-Length` y carpeta `.entrantes`. Al terminar la petición, con éxito o con error, borra los temporales de `req.file` y `req.files`. Un `:id` mal formado falla en un pipe, después de Multer y antes del servicio, así que la limpieza del servicio no llega a correr. La revisión de seguridad lo marcó como riesgo de llenar el disco. Al probarlo, la versión instalada de `@nestjs/platform-express` ya borra esos temporales cuando el manejador falla. La limpieza propia queda como defensa en profundidad, para no depender de ese comportamiento, y las pruebas lo vigilan.
- **Corrección de traducción**: Nest entrega el campo ajeno como «Unexpected file field - <campo>», no como «Unexpected field», así que el mensaje en español nunca se aplicaba. Ahora se reconoce el prefijo, también en sesiones.

## Consecuencias

- El alcance se comprueba después de que Multer guarda hasta 20 MB: es una carga transitoria que se acepta con unos 10 usuarios; los temporales se borran al terminar.
- Las dos rutas comparten el servicio `CierreAnulacionService` y el filtro global de errores; no hay lógica de estado fuera de la API y la base.
- La fecha efectiva depende del reloj de la API; si algún día hace falta que la base también la exija, será una migración con aprobación.
