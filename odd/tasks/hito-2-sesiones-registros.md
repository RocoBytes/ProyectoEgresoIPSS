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
- Pendientes que decide el usuario:
  - el trigger del correlativo trunca desde el número 1.000 del año (`lpad`), una regla SQL protegida;
  - Caddy limita cada petición a 25 MB en total, aunque cada archivo admite 20 MB.

## Próximo paso

Hito 3: cierre con evidencia, anulación y panel.
