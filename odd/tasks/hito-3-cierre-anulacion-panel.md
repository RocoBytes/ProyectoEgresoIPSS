# Hito 3: cierre, anulación y panel

Ubicación: `odd/tasks/hito-3-cierre-anulacion-panel.md` · Espejo en Engram: `odd/hito-3-cierre-anulacion-panel/tasks`

## Objetivo

Cerrar un registro con fecha efectiva, evidencia y comentario opcional (RF-12), anularlo con motivo (RF-13) y mostrar el panel con filtros, indicadores y gráficos (RF-07, RF-08). Todo sigue el prototipo v4.

## Por qué

Es el tercer bloque del calendario (07-12 al 13-12-2026) y cierra el ciclo de vida del registro. Sin cierre ni anulación los indicadores del panel no tienen sentido.

## Alcance autorizado

Plan aprobado por el usuario el 26-11-2026, junto con los del hito 4 y los extras.

- `POST /api/registros/:id/cierre` (multipart: `datos` + `evidencia`) y `POST /api/registros/:id/anulacion` (JSON).
- Módulo `reportes` con `GET /api/reportes/panel?anio&sectorId&carreraId`, agregado en SQL.
- Web: botones y diálogos de cierre y anulación en el detalle; panel con filtros en la URL y clic hacia el listado.

Supuestos aprobados:
- Un HEIC en el cierre recibe el mensaje de convertir a JPG (regla general del contexto).
- Comentario de cierre y motivo de anulación con un máximo de 2.000 caracteres.
- La evidencia de cierre se guarda sin sesión (`sesion_id` nulo).
- Filtros del panel en la URL, como el listado (el prototipo los guardaba en el navegador).
- Recharts para columnas por mes, dona y líneas. Las barras clicables (canal, nivel, sector o carrera) son botones HTML para que funcionen con teclado.
- Sin la animación de cifras del prototipo.

Fuera de alcance: mallas (RF-06), exportación (RF-10), catálogos reales, usuarios, respaldo y Playwright (hito 4 y extras).

## Restricciones

- Las de `CLAUDE.md`. No se modifica ninguna regla SQL: las de cierre y anulación ya existen y las cubren las 26 pruebas.
- Sin dependencias nuevas en este hito.
- Si algo falla por una versión, detenerse.
- Se avanza sin parar entre tareas, salvo un fallo de versión o una decisión nueva.

## Configuración de pruebas

- TDD no configurado (desactivado), igual que el hito 2.
- Jest para la API, contra `bd-pruebas`. Vitest para la web. `npm run test:bd` para las 26 reglas.

## Tareas

- [x] **P1 API de cierre y anulación.** Interceptor con campo `evidencia`, validador de evidencia de cierre (PDF, JPG o PNG por contenido, HEIC con mensaje propio), cierre transaccional con limpieza del archivo, anulación con motivo, 400/403/409 y textos del historial. Ruta: delegada (escritor de la API; más de 2 archivos no triviales).
- [x] **P1b Sugerencias de la revisión nativa.** Cuatro hallazgos informativos (no bloqueantes):
  - que el `rm` del temporal no tape el error original;
  - prueba de carrera en la anulación;
  - pruebas de límites del interceptor de cierre (dos evidencias, campo inesperado, más de 100 MB);
  - el aviso de 100 MB de Nueva sesión que no se limpia al quitar fotos (este va en P3).

  Ruta: delegada (escritor de la API; P3 para la web).
- [x] **P2 API del panel.** Módulo `reportes` con indicadores, dona, anillos, series por mes y por año, canal, nivel, sector o carrera y últimas 5 sesiones. Ruta: delegada (mismo escritor).
- [x] **P3 Web: cerrar y anular.** Botones en el detalle, `DialogoCerrar` y `DialogoAnular` con textos y validaciones del prototipo; la zona de archivo pasa a `comun/`. Ruta: delegada (escritor de la web).
- [x] **P4 Web: panel.** Filtros en la URL, indicadores, gráficos, estados vacíos, últimas sesiones y clic hacia el listado. Ruta: delegada (mismo escritor).
- [ ] **P5 Cierre del hito.** Revisión independiente de seguridad, prueba en Compose con la semilla contra las cifras del prototipo, ADR 0016 y 0017, `CLAUDE.md`, y las 3 sugerencias de la segunda revisión nativa sobre la prueba de carga del panel. Ruta: inline o delegada.
  - Revisión de seguridad (hecha sobre `c8f0cc1..5db34d3`, solo lectura): sin hallazgos altos ni medios. Dos bajos:
    - (1) Un `:id` mal formado en `/cierre` responde 404 desde el pipe, después de que Multer escribió el archivo en `.entrantes`, y el `finally` del servicio nunca corre. Repetirlo llena el disco hasta el barrido del arranque. Se corrige limpiando los temporales en el interceptor cuando termina la petición, sea cual sea el resultado (también en sesiones), con su prueba.
    - (2) El alcance se comprueba después de que Multer guarda hasta 20 MB. El archivo se borra, así que es solo carga transitoria y se acepta con unos 10 usuarios; queda anotado en el ADR 0016.

## Criterios de aceptación

- **Cierre:**
  - La fecha efectiva no es posterior a hoy (Santiago) ni anterior a la sesión.
  - La evidencia es obligatoria y se valida por contenido.
  - Si la transacción falla, no queda el archivo.
  - Fuera de alcance o con perfil de Calidad responde 403. Un registro cerrado o anulado responde 409, también con dos cierres simultáneos.
- **Anulación:** el motivo tiene al menos 10 caracteres, y responde 403 y 409 igual que el cierre.
- **Historial:** muestra «Cerrado con fecha efectiva … y evidencia "…".» y «Anulado. Motivo: …».
- **Panel:** con la semilla y hoy = 26-11-2026 en 2026 muestra:
  - 14 ajustes (+9 respecto de 2025);
  - 9 abiertos con 2 vencidos;
  - 4 cerrados (31 % de los vigentes);
  - 10 carreras de 10;
  - 75 % de cierres en plazo y 78 % de abiertos al día.
- **Clic en gráficos:** un clic en canal, nivel, sector o carrera, o en un estado de la dona, abre `/registros` con los filtros del panel más esa dimensión.
- **Calidad:** lint, tipos y todas las pruebas en verde. Corre en Compose.

## Entrega

- Rama `hito-3`, encima de `hito-2`. Un commit por tarea como mínimo.
- Previsión: unas 2.500 líneas, en PR encadenados. La estrategia de cadena sigue pendiente del usuario y se decide antes del push. No se hace push.
- Último límite revisado por la revisión nativa: `ecedb33`.

## Progreso y evidencia

- 26-11-2026: planes del hito 3, el hito 4 y los extras aprobados; rama `hito-3` creada desde `c8f0cc1`.
- P1 (`36bdd51`):
  - `POST /api/registros/:id/cierre` y `/anulacion`, `CierreAnulacionService`, `SubidaEvidenciaCierreInterceptor` y `validarEvidenciaCierre`.
  - 13 pruebas nuevas en `cierre-anulacion.e2e-spec.ts`, incluida la carrera de dos cierres sin archivo huérfano.
  - El historial no cambió: el detalle ya entrega `tipo` CIERRE/ANULACION y la web arma el texto.
  - Evidencia: `npm test` con 26 reglas, Jest 254 (23 suites) y Vitest 94; lint y tipos en 0. El padre volvió a correr `npm test` con el mismo resultado.
  - Revisión nativa del tramo `e9cb0d2..36bdd51` (H8, H9 y P1): riesgo medio, 816 líneas, `slice_budget_reached`. El usuario la autorizó y se aprobó con el lente de confiabilidad, sin bloqueos, y quedó reconocida. El nuevo límite revisado es `36bdd51`.
- P1b (`18866d2`):
  - El `rm` del temporal ya no tapa el error original.
  - Pruebas nuevas: carreras de anulación contra anulación y contra cierre, y límites del interceptor de cierre (dos evidencias, campo `acta` inesperado y más de 100 MB).
  - La prueba del campo inesperado destapó un defecto: Nest entrega «Unexpected file field - campo» y la traducción esperaba «Unexpected field», así que el mensaje salía en inglés, también en sesiones. Quedó corregido.
  - Evidencia: Jest 256.
  - Evaluación de riesgo: medio, 90 líneas, `under_budget` (pendiente en el tramo).
- P2 (commit de esta tarea):
  - Módulo `reportes` con `GET /api/reportes/panel` y el tipo `RespuestaPanel` en `@ipss/shared`. Son 7 consultas SQL en paralelo con parámetros enlazados (`Prisma.sql`), sin concatenar texto.
  - `porCanal` y `porGrupo` llevan `id` para el clic hacia el listado.
  - 7 pruebas con años 2041 a 2044 y un sector propio, incluida una de 1.000 registros en menos de 1 s.
  - Evidencia:
    - `npm test`: 26 reglas, Jest 264 (24 suites) y Vitest 94; lint y tipos en 0.
    - Con la base de desarrollo sembrada y hoy = 26-11-2026 el panel coincide con el prototipo, descontando la sesión «Reunión de prueba en vivo» que quedó de la prueba en vivo del hito 2 (1 registro abierto, comité sectorial, asignatura, Tecnologías, noviembre).
    - Con eso quedan 14 ajustes, 9 abiertos, 2 vencidos, 4 cerrados, 13 vigentes, 3 en plazo, 10 de 10 carreras y `totalAnioAnterior` 5. El 2025 da 5 cerrados, 5 en plazo y `totalAnioAnterior` nulo.
  - Diferencia conocida con el prototipo: canales y sectores salen en orden alfabético («Otro» al final), igual que en `GET /api/catalogos`. El prototipo usa un orden fijo. Ya estaba anotado como pendiente menor.
  - Commit `b31cd4f`.
  - Revisión nativa del tramo `36bdd51..b31cd4f` (P1b y P2): riesgo medio, 629 líneas, `slice_budget_reached`. El usuario la autorizó y se aprobó con el lente de confiabilidad, sin bloqueos, y quedó reconocida. El nuevo límite revisado es `b31cd4f`.
  - Quedaron 3 sugerencias sobre la prueba de carga de `reportes.e2e-spec.ts`, que van a P5:
    - desactiva el trigger del correlativo en la base compartida (hoy Jest corre en serie);
    - arma año y correlativo con `Math.random`;
    - mide con un umbral rígido de 1.000 ms.
- P3 (commit de esta tarea):
  - En el detalle aparecen «Anular», «Editar» y «Cerrar con evidencia», en el orden del prototipo.
  - `DialogoCerrar` y `DialogoAnular` llevan los textos, validaciones y toasts del prototipo. Un 400 se muestra campo por campo; un 403, 404 o 409 aparece como aviso dentro del diálogo; un 413 vacío se traduce al mensaje de 20 MB.
  - Al terminar se invalidan las consultas `['registros']` y `['reportes']`.
  - `ZonaArchivo`, `FilaArchivo` y la validación de archivos pasan a `comun/`. `Boton` suma la variante `fantasma`.
  - Nueva sesión borra el aviso de 100 MB al cambiar el acta o las fotos (sugerencia de la primera revisión).
  - El historial y la trazabilidad de cerrados y anulados ya estaban completos; no se tocaron.
  - Evidencia: `npm test` con 26 reglas, Jest 264 y Vitest 116 (22 nuevas); lint y tipos en 0. El padre volvió a correr `npm test` con el mismo resultado.
  - Commit `af20d48`.
  - Revisión nativa del tramo `b31cd4f..af20d48`: riesgo medio, 889 líneas. El usuario la autorizó y se aprobó sin bloqueos; quedó reconocida. El nuevo límite revisado es `af20d48`.
  - Las 3 sugerencias van a P3b:
    - el tope del comentario se medía sin recortar espacios;
    - falta probar que se acepta una fecha efectiva igual a la de la sesión;
    - falta probar que el detalle se refresca tras un 409.
- P3b (commit de esta tarea):
  - El tope del comentario se mide sobre el texto recortado.
  - Pruebas nuevas: cierre con fecha efectiva igual a la de la sesión y comentario de 2.000 caracteres entre espacios, y el detalle que se vuelve a pedir tras un 409 en los dos diálogos.
  - Evidencia: `npm test` con salida 0, 26 reglas, Jest 264 y Vitest 119; lint y tipos en 0. El padre volvió a correr Vitest de la web: 119.
- P4 (commit de esta tarea):
  - `panel/` reemplaza a `EnConstruccion`. Filtros `anio`, `sector` y `carrera` en la URL; el año va en botones con `aria-pressed`. Cuatro indicadores, columnas por mes y dona (Recharts), tres anillos, tarjetas por año, barras clicables de canal, nivel y sector o carrera (botones HTML) y últimas sesiones.
  - Cada clic hacia el listado lleva el año y los filtros del panel más la dimensión elegida.
  - Para lectores de pantalla, el dibujo de Recharts va con `aria-hidden` y hay una tabla oculta con los 12 meses. La leyenda de la dona son botones.
  - Clave de consulta `['reportes','panel',anio,sector,carrera]`.
  - 22 pruebas nuevas con las cifras del prototipo.
  - Evidencia: `npm test` con salida 0, 26 reglas, Jest 264 y Vitest 141; lint y tipos en 0; `vite build` correcto. El padre volvió a correr lint y Vitest de la web: 141.
  - Diferencias que quedan para revisar en el navegador (P5):
    - falta el número sobre la columna del mes máximo;
    - los tooltips de las barras HTML son `title` nativos.
    - El dibujo de Recharts no se pudo probar en jsdom.
  - Commit `ecedb33`.
  - Revisión nativa del tramo `af20d48..ecedb33` (P3b y P4): riesgo medio, 1.240 líneas. El usuario la autorizó y se aprobó; quedó reconocida. El nuevo límite revisado es `ecedb33`.
  - Dejó una advertencia: con `keepPreviousData`, el panel mezclaba los filtros nuevos de la URL con los datos viejos mientras cargaba, y un clic podía armar `carrera=<id de sector>`. También faltaba avisar cuando falla una recarga.
  - Desde aquí el usuario indicó: «todos los cambios que vengan, acéptalos todos para hacer la revisión». Las revisiones siguientes se autorizan con esa instrucción.
- P4b (commit de esta tarea):
  - Los datos viajan con los filtros con que se pidieron, y el contenido y los clics salen de ahí. El título del grupo sale del `tipo` de las filas.
  - Mientras carga, el contenido queda con `aria-busy`, `inert` y atenuado. Si una recarga falla, aparece un aviso con «Reintentar».
  - Pruebas de los indicadores de cerrados y total, del estado en vuelo y de los fallos.
  - Cifra sobre la columna del máximo: colgaba de la barra de anulados, que mide cero, y Recharts numeraba sin las barras vacías. Se resolvió con una barra invisible con el total, en su propio eje X oculto.
  - Evidencia:
    - `npm test` con 26 reglas, Jest 264 y Vitest 147; lint y tipos en 0.
    - El padre comprobó en Chrome sin interfaz contra el servidor de desarrollo: panel completo, desglose por carrera con el sector Tecnologías, diálogos de cerrar y anular, y un cierre completo desde la pantalla con archivo adjunto. Quedó «CERRADO · 26-11-2026», con historial, evidencia, SHA-256 y el toast. La cifra «3» sale sobre marzo.
    - Ese cierre (R-2026-016) quedó en la base de desarrollo.

## Próximo paso

P5 cierre del hito.
