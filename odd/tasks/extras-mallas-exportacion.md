# Extras: versiones de malla y exportación a Excel

Ubicación: `odd/tasks/extras-mallas-exportacion.md` · Espejo en Engram: `odd/extras-mallas-exportacion/tasks`

## Objetivo

- **Versiones de malla por carrera (RF-06):** pantalla «Mallas» con listado y subida del PDF.
- **Exportación a Excel de las filas del listado filtrado (RF-10).**

## Por qué

El contexto las deja al final, «solo si lo anterior está cerrado», y los hitos 3 y 4 ya lo están. Sin RF-06, en producción no se pueden crear registros de nivel Malla, porque hoy solo la semilla crea versiones de malla.

## Alcance autorizado

Plan aprobado por el usuario el 26-11-2026, junto con los hitos 3 y 4.

- **E1. Mallas.**
  - **API:** módulo `mallas`, con `GET /api/mallas?carreraId` y `POST /api/mallas` (multipart: `datos` con `{ carreraId, anio, vigenteDesde }` más el archivo PDF).
  - **Web:** pantalla «Mallas» con los textos del prototipo (`prototipo-v4.html` :1153-1162, :1194-1199, :1231-1239).
  - El archivo es una fila de `evidencia` con `sesion_id` NULL, según el ADR 0005. Evidencia y versión se crean en una sola transacción.
- **E2. Exportación.**
  - **API:** `GET /api/registros/exportar`, con los mismos filtros del listado y sin paginar. Devuelve `registros-<año|todos>.xlsx`, escrito con exceljs, que ya está instalado.
  - **Web:** botón «Exportar a Excel» en Registros, deshabilitado si el listado está vacío, con el toast del prototipo.
  - **Columnas propuestas en el plan aprobado:** las del listado más la descripción, la fecha efectiva, el comentario y el motivo.
  - Todo valor de texto va como celda de texto, nunca como fórmula.

Supuestos, porque el prototipo no los define:
- **Mallas, permisos de lectura:** cualquier perfil ve y descarga las versiones.
- **Mallas, permisos de subida:** solo los directores, cada uno dentro de su alcance (decisión abierta 9).
- **Mallas, versión vigente:** la marca de «Vigente» va en la de año más reciente.
- **Exportación, quién puede:** también Aseguramiento de la Calidad (decisión abierta 9).
- **Exportación, fechas:** van como texto `dd-mm-aaaa`, igual que en pantalla, para no convertir columnas DATE a `Date`.

Fuera de alcance: reemplazar o borrar una versión de malla (ADR 0005: se crea otra versión).

## Restricciones

- Las de `CLAUDE.md`. Sin cambios en reglas SQL ni en roles: `ipss_api` ya tiene INSERT sobre `version_malla` y `evidencia`.
- Sin dependencias nuevas.
- El usuario preautorizó las revisiones nativas.
- `git add` siempre por archivo.

## Configuración de pruebas

TDD desactivado. Jest (`bd-pruebas`), Vitest, `npm run test:bd` y `npm run e2e`.

## Tareas

- [x] **E1a API de mallas.** Listado y subida con validaciones, permisos y transacción. Ruta: delegada (escritor de la API).
- [x] **E2a API de exportación.** Mismos filtros que el listado, streaming, celdas de texto y tope de filas. Ruta: delegada (mismo escritor).
- [ ] **E1b Web de mallas.** Ruta: delegada (escritor de la web).
- [ ] **E2b Web de exportación.** Ruta: delegada (mismo escritor).
- [ ] **E3 Cierre.** Prueba en Compose, ADR y documentación. Ruta: inline o delegada.

## Criterios de aceptación

- **Mallas:**
  - Un director sube una versión en PDF para una carrera de su alcance, y aparece con «Vigente» si es la más reciente.
  - Repetir el año da el error «Ya existe la malla AAAA de esta carrera.».
  - Fuera de alcance o con perfil de Calidad responde 403, y en pantalla aparece «Solo consulta».
  - La nueva versión aparece como objeto de nivel Malla en Nueva sesión.
- **Exportación:**
  - Las filas del archivo son exactamente las del listado filtrado, incluido «Abierto y vencido» y la búsqueda.
  - El nombre del archivo sigue el prototipo.
- **Calidad:** lint, tipos y pruebas en verde. Corre en Compose.

## Entrega

- Rama `extras-mallas-exportacion`, encima de `hito-4`. Previsión: unas 1.500 líneas, en PR encadenados. No se hace push.
- Límite revisado por la revisión nativa: `b69c926`. El tramo `b69c926..7aeed77` sigue pendiente.

## Progreso y evidencia

- 27-11-2026: hito 4 cerrado; rama creada desde `7aeed77`.
- E1a (commit de esta tarea):
  - Módulo `mallas` (`GET /api/mallas?carreraId` y `POST /api/mallas`), `SubidaMallaInterceptor` (campo `archivo`), `validarMalla` y tipos `RespuestaMallas` en `@ipss/shared`.
  - `AlcanceService.motivoDeConsulta(usuario, carrera, que)` recibe el sustantivo; los textos de registros no cambian.
  - **Decisiones del escritor, aceptadas:**
    - un año duplicado, ya sea por la comprobación previa o por un P2002 en carrera, da 400 en el campo `anio`, igual que el resto de los errores por campo;
    - un `carreraId` mal formado da 404.
  - 8 pruebas: orden, campo `vigente`, permisos, descarga idéntica, errores por campo, 413, carrera entre dos subidas y objetos de nivel Malla.
  - Evidencia: el padre volvió a correr `npm test` (26 reglas, Jest 309 en 29 suites, Vitest 149).
  - Commit `a55acb6`.
- E2a (commit de esta tarea):
  - **Filtros compartidos.** `filtros-registros.ts` (`condicionesDeRegistros`, `ORDEN_DE_REGISTROS`) queda compartido entre el listado y la exportación.
  - **Endpoint.** `GET /api/registros/exportar` usa `exceljs` `WorkbookWriter` y lee en lotes de 1.000.
    - Una hoja «Registros» con encabezado en negrita, paneles congelados y 19 columnas.
    - Fechas `dd-mm-aaaa` y «Registrado el» en hora de Santiago.
    - Más de 20.000 filas da 400 antes de escribir nada.
    - Usa `Cache-Control: private, no-store`.
  - **Columnas que eligió el escritor, aceptadas:**
    - N° es el correlativo;
    - Año es el de la sesión;
    - «Registrado por» es quien creó la sesión;
    - «Registrado el» es `creado_en`.
  - **Pruebas:**
    - 13 combinaciones de filtros coinciden con el listado, en el mismo orden;
    - cabeceras y nombre del archivo;
    - las celdas que empiezan con `=`, `+`, `-` o `@` salen como texto, y ninguna celda es fórmula;
    - el tope se prueba bajándolo en memoria;
    - 401, 200 para los tres perfiles y 400 con filtros inválidos.
  - ADR 0022 (mallas y exportación).
  - **Evidencia:** el padre volvió a correr `npm test` (26 reglas, Jest 316 en 30 suites, Vitest 149). Lint y tipos en 0.

## Próximo paso

E1a y E2a (escritor de la API).
