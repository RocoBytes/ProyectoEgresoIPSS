# Hito 2: sesiones, registros, listado y detalle

Ubicación: `odd/tasks/hito-2-sesiones-registros.md` · Espejo en Engram: `odd/hito-2-sesiones-registros/tasks`

## Objetivo

Registrar una sesión con su acta y sus registros (RF-03 a RF-05), listarlos con filtros (RF-09) y ver el detalle con su historial (RF-11). Incluye editar la descripción y la fecha comprometida. Todo sigue el prototipo v4.

## Por qué

Es el segundo bloque del calendario (30-11 al 06-12-2026) y el centro del producto. El cierre, la anulación y el panel (hito 3) se apoyan en esto.

## Alcance autorizado

Plan aprobado el 26-11-2026, con ocho decisiones:

1. **Fechas sin hora:** texto `AAAA-MM-DD` en la API. Hay un único módulo de conversión, y «hoy» se calcula en Santiago con el reloj inyectable.
2. **Objeto según el nivel, en la base:**
   - un CHECK que fija qué columnas lleva cada nivel;
   - un trigger que exige que la asignatura o la malla sean de la misma carrera y que el tipo corresponda.
3. **Registros duplicados en una sesión:** se validan en la API.
4. **Componentes de interfaz:** estilo shadcn con `<dialog>` y `<select>` nativos. Dependencias: `clsx`, `tailwind-merge`, `class-variance-authority` y `@fontsource/ibm-plex-mono`. Sin Radix.
5. **Edición:** descripción y fecha comprometida entran en este hito.
6. **Borrador automático:** se pospone.
7. **Semilla:** suma las 11 sesiones, los 19 registros y las 10 mallas del prototipo, con PDF de relleno. Los folios saldrán R-2026-NNN porque el trigger usa el año actual. Andrea Molina y Rodrigo Vera se crean como usuarios inactivos.
8. **Filtros del listado en la URL.**

Supuestos del contexto que se aplican:
- Decisión abierta 3: leer está permitido para todos; modificar fuera del alcance devuelve 403 con el motivo del prototipo.
- Decisión abierta 8: se agrega el filtro por asignatura.
- «Exportar a Excel» queda oculto hasta RF-10.

Fuera de alcance:
- cerrar y anular (hito 3);
- el panel (hito 3);
- la carga de mallas (RF-06);
- la exportación (RF-10);
- el borrador.

## Restricciones

- Las de `CLAUDE.md`: las 26 pruebas se mantienen y no se tocan las reglas SQL existentes.
- Si algo falla por una versión, detenerse.
- Se avanza sin parar entre partes, salvo un fallo de versión o una decisión nueva.

## Configuración de pruebas

- TDD no configurado (desactivado).
- Jest para la API, contra `bd-pruebas`.
- Vitest para la web.
- `npm run test:bd` para las 26 reglas.

## Tareas

- [x] **H1 Base.** Módulo `fecha-texto`, migración de reglas del objeto (CHECK y trigger), `DIRECTORIO_EVIDENCIAS` y API de catálogos. Ruta: delegada (escritor de la API).
- [x] **H2 Evidencias y creación de sesiones.** Almacenamiento en disco tras una interfaz, validación por contenido, SHA-256 por stream, descarga verificada y `POST /api/sesiones` transaccional. Ruta: delegada (escritor de la API).
- [x] **H3 Registros.** Listado con filtros, búsqueda y paginación; años; detalle con historial y permisos; edición; semilla con datos de ejemplo. Ruta: delegada (escritor de la API).
- [x] **H4 Web base.** Componentes de estilo shadcn, IBM Plex Mono y buscador de la barra superior. Ruta: delegada (escritor de la web).
- [x] **H5 Web: Nueva sesión.** Ruta: delegada (escritor de la web).
- [x] **H6 Web: Registros, Detalle y Editar.** Ruta: delegada (escritor de la web).
- [x] **H7 Cierre.** Revisión independiente de seguridad y sus correcciones, prueba en Compose, ADR 0011 a 0014 y `CLAUDE.md`. Ruta: inline o delegada.
- [x] **H8 Correlativo desde el número 1000.** Migración nueva que reemplaza `asignar_correlativo()`: rellena a 3 dígitos solo bajo 1000 y desde ahí usa el número completo. Prueba en Jest dentro de una transacción que se revierte, y ADR 0015. Aprobada por el usuario el 26-11-2026 (regla SQL protegida). Ruta: delegada (escritor de la API, 3 archivos).
- [x] **H9 Tope de 100 MB por envío.** Caddy pasa de 25 MB a 100 MB en `/api/*` (máximo del plan gratuito de Cloudflare). La API rechaza con 413 y un mensaje en español un `Content-Length` mayor, antes de leer el cuerpo. Prueba, ajuste del ADR 0013 y verificación en Compose. Aprobada por el usuario el 26-11-2026 (configuración de seguridad). Ruta: delegada (mismo escritor); Compose inline.

## Criterios de aceptación

- **Crear una sesión:**
  - Un director crea una sesión con acta, fotos opcionales y varios registros de su alcance, con las validaciones y mensajes del prototipo.
  - Los archivos se validan por contenido y el SHA-256 se verifica al descargar.
  - Si falla la transacción, no quedan archivos huérfanos.
- **Listado:**
  - Filtra por año de la sesión, sector, carrera, asignatura, canal, nivel y estado (incluido «Abierto y vencido»), y busca por texto.
  - Pagina de 10 en 10 y responde en menos de 1 s con 1.000 registros.
- **Detalle:**
  - Muestra la trazabilidad, la sesión de origen con sus descargas, el historial y los otros registros de la sesión.
  - Editar queda en el historial. Fuera del alcance responde 403 y un registro cerrado responde 409.
- **Calidad:** lint, tipos y todas las pruebas en verde. Corre en Compose.

## Entrega

- Rama `hito-2`, encima de `inicio-sesion`.
- Un commit por tarea como mínimo.
- Previsión: unas 5.000 líneas, así que la entrega irá en PR encadenados. La estrategia sigue pendiente del usuario y no se hace push.

## Progreso y evidencia

- 26-11-2026: plan aprobado, rama `hito-2` creada.

- H1 a H3 (`15eb9b5`): catálogos, evidencias, `POST /api/sesiones`, listado, años, detalle, edición, semilla del prototipo y ADR 0011 a 0013.
- H4 a H6 (`b1df956`): componentes de estilo shadcn sin Radix, Nueva sesión, Registros y Detalle con edición, y ADR 0014.
- Revisión independiente de seguridad: sin hallazgos graves y 5 de severidad media o baja confirmados. Se corrigieron en `b6857ee`:
  - paginación acotada;
  - límites de tamaño;
  - nombres de archivo saneados;
  - descarga verificada sobre el mismo descriptor de archivo;
  - limpieza de archivos temporales al arrancar;
  - `chmod 0640`.
  También se corrigió la altura de la barra lateral.
- Evidencia:
  - `npm test`: 26 reglas, 237 pruebas de Jest y 92 de Vitest. Lint y tipos en 0.
  - Compose de producción: cinco servicios bien y 4 migraciones aplicadas.
  - API en vivo: crear sesión, listado, vencidos, detalle y descarga con `cmp` idéntico.
- Tras el cierre quedaron dos defectos. El usuario aprobó corregirlos el 26-11-2026:
  - el trigger del correlativo truncaba desde el número 1.000 del año (`lpad`), una regla SQL protegida;
  - Caddy limitaba cada petición a 25 MB en total, aunque cada archivo admite 20 MB.
- H8 (`5ade192`): migración `20261127100000_correlativo_desde_mil` con `lpad(n, greatest(3, length(n)))`, prueba en Jest dentro de una transacción que se revierte (999, 1000 y 1001; antes de la migración fallaba por clave duplicada) y ADR 0015. El listado ya ordenaba por `anio, numero`, no por el texto del folio.
- H9 (`4f282b7`, `eced13b`):
  - Caddy pasa a 100 MB en `/api/*`, que es el tope del plan gratuito de Cloudflare. La API responde 413 con mensaje cuando el `Content-Length` supera 100.000.000, sin leer el cuerpo.
  - En Compose se observó que Caddy rechaza primero, por `Content-Length`, con un 413 sin cuerpo, y la API no llega a ver la petición.
  - Por eso la web estima el total antes de enviar y muestra el mismo mensaje de la API. Un 413 sin mensaje de la API se traduce a ese texto.
- Evidencia de H8 y H9:
  - `caddy validate`: configuración válida.
  - Compose: 5 migraciones aplicadas. Un envío de 30 MB por Caddy da 201; uno de unos 114 MB da 413 de Caddy.
  - `npm test`: 26 reglas, Jest 241 (22 suites) y Vitest 94. Lint y tipos en 0.
  - Evaluación de riesgo de la revisión nativa desde `e9cb0d2`, excluyendo los archivos sin seguimiento: riesgo medio por la migración, 245 líneas en 12 archivos. Queda bajo el presupuesto de unas 400 líneas, así que la revisión todavía no corresponde y estos commits se suman al tramo pendiente.
- Pendiente menor: las respuestas de error propias de Caddy (por ejemplo el 413) muestran `Server: Caddy`, porque `header -Server` no las cubre. Corregirlo con `handle_errors` es un cambio de configuración de seguridad y lo decide el usuario.

## Próximo paso

Hito 3: cierre con evidencia, anulación y panel.
