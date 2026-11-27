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
- [x] **E1b Web de mallas.** Ruta: delegada (escritor de la web).
- [x] **E2b Web de exportación.** Ruta: delegada (mismo escritor).
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
- Límite revisado por la revisión nativa: `dbb5fbc`.

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
  - Commit `a0ea522`.
  - **Revisión nativa** de `b69c926..a0ea522` (cierre del hito 4, E1a y E2a): riesgo medio, 1.047 líneas, autorizada por la instrucción del usuario. Se aprobó y quedó reconocida. El límite revisado pasa a `a0ea522`.
  - **Dos advertencias para E2c:**
    - la exportación no es una foto consistente: `count` y los lotes van en consultas separadas;
    - cualquier P2002 se informa como año de malla duplicado.
- [x] E2c (commit de esta tarea):
  - **Exportación.** El conteo y los lotes corren en una sola `$transaction` `RepeatableRead` (120 s), y sigue en streaming; `commit` del libro va fuera. Una prueba crea y cierra registros entre lotes y comprueba que la exportación coincide con la foto previa. Sin `RepeatableRead` esa prueba falla, así que distingue.
  - **Malla duplicada.** `errores-malla.ts` reconoce solo el índice `version_malla_carrera_id_anio_key`, que Prisma 7 con el adaptador entrega en `meta.driverAdapterError.cause.constraint.index`. Tiene 4 pruebas unitarias.
  - **Evidencia:** el padre volvió a correr `npm test` (26 reglas, Jest 321 en 31 suites, Vitest 149). Lint y tipos en 0.
  - Commit `543ebf6`. Evaluación: medio, 253 líneas, `under_budget`.
- E1b (commit de esta tarea):
  - **Pantalla.** `mallas/PaginaMallas.tsx`, `DialogoMalla.tsx` y `api.ts`.
    - Selector de carrera con grupos por sector y `?carrera=`, que por defecto toma la primera carrera del alcance.
    - Tabla con la pastilla «Vigente», estado vacío, «Subir versión» solo con permiso y aviso «Solo consulta» en los demás casos.
    - El diálogo usa los mensajes de la API. Al subir, invalida `['mallas']` y `['objetos', carreraId]`.
  - **Piezas extraídas a `comun/`:**
    - `FilaDescarga`, sacada del detalle;
    - `errores-api.ts`, antes `registros/errores-cambio-estado.ts`;
    - el destino `malla` en `archivos.ts`;
    - el ícono `subir`.
  - **Pruebas:** 9 nuevas. La prueba de `RutaProtegida` usaba Mallas como marcador de posición; ahora simula catálogos y mallas.
  - **Evidencia:**
    - `npm test` con 26 reglas, Jest 321 y Vitest 158; lint y tipos en 0. El padre volvió a correr Vitest: 158.
    - Capturas en Chrome sin interfaz contra el servidor de desarrollo:
      - Carla ve la tabla con «Malla 2023 · Vigente» y el botón «Subir versión», y el diálogo «Nueva versión de malla» con los campos del prototipo;
      - Paula ve «Solo consulta: puedes revisar y descargar sus mallas, pero no modificar.» sin el botón.
  - Commit `e2bee69`.
- E2b (commit de esta tarea):
  - **Botón.** «Exportar a Excel» va en la cabecera de Registros.
    - Se deshabilita con total 0 y mientras descarga (`aria-busy`).
    - Muestra el toast del prototipo con el nombre efectivo y la palabra «fila» o «filas» según el total.
    - Si la API responde un error, se muestra en un aviso con su mensaje.
  - **Piezas reutilizables:**
    - `parametrosApi`, compartida entre el listado y la exportación, que no envía `pagina`;
    - `solicitarArchivo` y `nombreDeDescarga`, que leen `Content-Disposition` y quitan separadores de ruta del nombre;
    - `comun/descargar.ts`;
    - el ícono `tabla`.
  - **Pruebas:** 7 nuevas.
  - **Evidencia:** `npm test` con 26 reglas, Jest 321 y Vitest 165; lint y tipos en 0. El padre volvió a correr Vitest: 165.
  - **Hueco detectado por el escritor:** el prototipo tiene «Nueva sesión» en la cabecera de Registros, junto a Exportar, y la web no. Pasa a E2d.
  - Commit `9fd46ea`.
- E2d (commit de esta tarea):
  - Enlace «Nueva sesión» a `/sesiones/nueva`, primario y con el ícono `mas`, a la derecha de Exportar, en el orden del prototipo. Solo aparece con `puedeCrear`, igual que en el menú lateral.
  - `clasesBoton` se exporta para dar estilo de botón a un `<Link>`.
  - 4 pruebas de visibilidad por rol.
  - Evidencia: lint y tipos en 0; Vitest 169, y el padre lo volvió a correr con 169.
  - Commit `dbb5fbc`.
  - **Revisión nativa** de `a0ea522..dbb5fbc` (E2c, E1b, E2b y E2d): riesgo medio, 1.237 líneas, autorizada por la instrucción del usuario. Se aprobó y quedó reconocida. El límite revisado pasa a `dbb5fbc`.
  - **Dos advertencias para E2e:**
    - el URL del blob se revoca en el mismo instante del clic;
    - Mallas no muestra un error si falla el catálogo.
- [x] E2e (commit de esta tarea):
  - **Descarga.** `descargar.ts` quita el enlace temporal después del clic y difiere `revokeObjectURL` 10 s. Tiene prueba con temporizadores falsos.
  - **Mallas.** Muestra «Cargando» mientras carga. Si falla el catálogo o la lista de mallas, aparece un aviso con «Reintentar». Con el catálogo vacío dice «Aún no hay carreras registradas.»; ese texto no viene del prototipo.
  - **Evidencia:** lint y tipos en 0; Vitest 173, y el padre lo volvió a correr con 173.

## Próximo paso

E1a y E2a (escritor de la API).
