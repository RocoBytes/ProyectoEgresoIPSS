# Hito 4: puesta en producción

Ubicación: `odd/tasks/hito-4-puesta-en-produccion.md` · Espejo en Engram: `odd/hito-4-puesta-en-produccion/tasks`

## Objetivo

Dejar la plataforma lista para que TI del IPSS la instale y la opere:
- cargar los catálogos reales sin tocar código;
- administrar usuarios desde la línea de comandos;
- respaldo diario con restauración probada (RNF-13);
- tres flujos de punta a punta con Playwright;
- guía de instalación de una página;
- publicación de imágenes.

## Por qué

Es el cuarto bloque del calendario (14-12 al 20-12-2026). Sin catálogos reales, sin cuentas ni respaldo, producción no se puede usar, aunque las funciones estén listas. Producción la instala y opera TI, que recibe imágenes y una guía.

## Alcance autorizado

Plan aprobado por el usuario el 26-11-2026, junto con el del hito 3 y los extras.

- **C1. Catálogos reales.** El comando carga sectores, carreras, asignaturas y módulos, y canales desde una planilla.
  - Revisa todo antes de escribir y carga en una sola transacción.
  - Se puede repetir sin duplicar, nunca borra y tiene modo de prueba.
  - El repositorio solo lleva datos de ejemplo. La plantilla la genera el propio comando.
- **C2. Usuarios.** Un comando para crear una cuenta con su rol y alcance, desactivarla, reactivarla, restablecer la clave y listar las cuentas. La clave temporal se muestra una sola vez y no queda en los logs.
- **C3. Respaldo diario.**
  - Servicio `respaldo` en Compose con la misma imagen de PostgreSQL 16.16.
  - A las 03:00 hora de Santiago respalda la base con `pg_dump` y las evidencias con su lista de SHA-256, y guarda 14 días en un volumen propio.
  - Usa el rol migrador, sin roles nuevos.
  - Incluye un script de restauración y una prueba que respalda, borra, restaura y compara.
- **C4. Punta a punta.**
  - Tres flujos con Playwright contra Compose: Carla crea una sesión y la ve en el listado; cierra un registro y el panel lo cuenta; Paula consulta, descarga y no ve acciones.
  - Job en CI.
  - Dependencia nueva aprobada: `@playwright/test` 1.65.1 exacta, publicada el 13-11-2026, sin avisos en OSV y sin script de instalación. Chromium se descarga aparte.
- **C5. Entrega.**
  - Guía de instalación de una página y README.
  - Publicación de imágenes en GHCR al crear una etiqueta; solo corre cuando el usuario haga push.
  - `handle_errors` en Caddy para quitar `Server: Caddy` y responder el 413 con JSON. Es configuración de seguridad y el usuario lo aprobó.

Fuera de alcance: mallas (RF-06) y exportación (RF-10), que van como extras; datos reales del IPSS en el repositorio.

## Restricciones

- Las de `CLAUDE.md`. No se modifican las reglas SQL ni los roles de base.
- La única dependencia nueva es `@playwright/test` 1.65.1 (exacta, bajo `.npmrc`).
- No se escribe ningún `.env*`: el bloqueo es de permisos. `infra/.env.ejemplo` lo crea el usuario con el contenido que se le entregue.
- Si algo falla por una versión, detenerse.
- Se avanza sin parar. El usuario preautorizó las revisiones nativas («todos los cambios que vengan, acéptalos todos para hacer la revisión»).

## Configuración de pruebas

- TDD no configurado (desactivado).
- Jest para la API, contra `bd-pruebas`; Vitest para la web; `npm run test:bd` para las 26 reglas.
- Playwright nuevo, contra Compose.

## Tareas

- [x] **C1 Catálogos reales.** CLI `catalogos` con planilla Excel (exceljs ya instalado), modo de prueba, plantilla generada, transacción, carga repetible sin duplicar y lectura por stdin para usarlo dentro del contenedor. Ruta: delegada (escritor de la API).
- [x] **C1b Hallazgos de la revisión de C1.** Limpieza de temporales esperada antes de responder, prueba unitaria que la distingue y pruebas de los límites de entrada del comando de catálogos. Ruta: delegada (escritor de la API).
- [x] **C2 Usuarios.** CLI `usuarios` (crear con alcance, desactivar, activar, restablecer clave, listar). Revoca sesiones al desactivar o restablecer y funciona con `NODE_ENV=production`. Ruta: delegada (mismo escritor).
- [ ] **C3 Respaldo y restauración.** Servicio `respaldo`, scripts para respaldar y restaurar, y prueba de restauración. Ruta: delegada (escritor de infraestructura).
- [ ] **C4 Punta a punta.** Playwright 1.65.1, tres flujos, comando `npm run e2e` y job en CI. Ruta: delegada.
- [ ] **C5 Entrega.** `handle_errors` en Caddy, publicación en GHCR por etiqueta, guía de instalación, README y contenido de `infra/.env.ejemplo` para el usuario. Ruta: delegada.

## Criterios de aceptación

- **Catálogos:** el comando carga una planilla válida en una transacción, rechaza una inválida sin escribir nada y la segunda corrida no cambia nada. Funciona dentro del contenedor de la API en producción.
- **Usuarios:** se crea una cuenta que puede entrar, se desactiva y ya no entra, se restablece la clave y la anterior deja de servir. La clave nunca aparece en los logs.
- **Respaldo:** hay un archivo diario con su lista de hashes y la restauración probada deja la base y las evidencias idénticas (conteos y `cmp` de descargas).
- **Punta a punta:** los tres flujos pasan contra Compose.
- **Calidad:** lint, tipos y todas las pruebas en verde. Corre en Compose.

## Entrega

- Rama `hito-4`, encima de `hito-3`. Un commit por tarea como mínimo.
- Previsión: unas 2.000 líneas, en PR encadenados. La estrategia de cadena sigue pendiente del usuario y se decide antes del push. No se hace push.
- Límite revisado por la revisión nativa: `5cbc52e`.

## Progreso y evidencia

- 26-11-2026: hito 3 cerrado; rama `hito-4` creada desde `a5f2075`.
- C1 (commit de esta tarea):
  - Archivos nuevos: `cli/cargar-catalogos.ts` (`leerPlanilla`, `cargarCatalogos`, `generarPlantilla`) y `cli/catalogos.ts`, con el script `catalogos` en la raíz y en la API.
  - **Hojas:**
    - `Sectores(Nombre)`
    - `Carreras(Sector, Nombre)`
    - `Asignaturas(Carrera, Tipo, Nombre, Código opcional)`
    - `Canales(Nombre, Activo)`

    Los encabezados se comparan sin tildes ni mayúsculas.
  - **Validación antes de escribir:** revisa todo y, ante un error, lo informa con hoja y fila, sale con código 1 y no escribe nada.
  - **Escritura:** una sola transacción. Nunca borra; lo que no viene en el archivo se lista como «no incluidos». La segunda corrida no cambia nada.
  - **Entradas:** solo `.xlsx` de hasta 5 MB (con firma zip) y hasta 20.000 filas por hoja. Acepta stdin con `-`, y `--plantilla` no pisa un archivo existente.
  - `ipss_api` ya tenía los permisos necesarios; no se tocaron roles.
  - **Decisiones del escritor, aceptadas:**
    - Mover una carrera de sector cuenta como actualización.
    - Los duplicados dentro del archivo se detectan sin distinguir mayúsculas ni tildes.
  - **Nota de uso:** `npm run catalogos -- --plantilla -` ensucia el binario con el encabezado de npm; hay que usar `node dist/cli/catalogos.js` o `npm run -s`.
  - **Evidencia:**
    - `npm test` con salida 0: 26 reglas, Jest 272 (25 suites) y Vitest 147; lint y tipos en 0.
    - Con `NODE_ENV=production`, la plantilla generada pasa `--prueba` sin errores.
  - Commit `5cbc52e`.
  - Revisión nativa del tramo `f99164e..5cbc52e` (cola del hito 3 y C1): riesgo medio, 873 líneas, autorizada por la instrucción del usuario. Se aprobó y quedó reconocida. El límite revisado pasa a `5cbc52e`.
  - La revisión dejó tres hallazgos para C1b:
    - la limpieza de temporales no se espera antes de responder;
    - las pruebas de esa limpieza pasan igual sin ella;
    - faltan pruebas de los límites de entrada del comando.
- C1b (commit de esta tarea):
  - **Limpieza:** `conLimpieza` espera el borrado de temporales antes de emitir el resultado (`concatMap`) o de relanzar el error (`catchError`). `finalize` queda solo como respaldo ante cancelaciones.
  - **Pruebas que distinguen la limpieza:** 3 pruebas unitarias con archivos reales en disco y manejadores que fallan o terminan bien. Fallan si se desactiva `limpiarTemporales`; lo comprobó el escritor.
  - **Comando de catálogos:** `principal` se puede probar. Hay 8 pruebas de los límites:
    - 5 MB por archivo y por stdin;
    - extensión `.xlsx`;
    - firma zip;
    - salida 2 si los argumentos son incorrectos;
    - salida 1 si la validación falla, sin escribir;
    - `--plantilla` que no pisa un archivo existente;
    - más de 20.000 filas.
  - **Evidencia:** `npm test` con salida 0, 26 reglas, Jest 283 (26 suites) y Vitest 147; lint y tipos en 0. El padre volvió a correr `npm test` con el mismo resultado.
  - Commit `4758a86`.
- C2 (commit de esta tarea):
  - Archivos: `cli/administrar-usuarios.ts` y `cli/usuarios.ts`, scripts `usuarios` y ADR 0018.
  - **Comandos:**
    - `crear`: correo normalizado, reglas de alcance por rol y cuenta con su alcance creada en una sola transacción.
    - `desactivar`: revoca las sesiones; el guard consulta la base, así que la sesión abierta cae al instante.
    - `activar`.
    - `restablecer-clave`: limpia el bloqueo y revoca las sesiones.
    - `listar`: nunca lee el hash.
  - **Clave temporal:** 24 caracteres (144 bits), se imprime una sola vez por stdout y el aviso sale por stderr. No pasa por ningún logger.
  - **Pruebas:** 7, contra la base real.
  - **Evidencia:**
    - `npm test` con salida 0, 26 reglas, Jest 290 (27 suites) y Vitest 147; lint y tipos en 0. El padre volvió a correr `npm test` con el mismo resultado.
    - `listar` funciona con `NODE_ENV=production`.
  - **Brechas para el usuario** (anotadas en el ADR 0018):
    - No hay pantalla para cambiar la clave propia.
    - Un alcance mal cargado no se puede corregir: `ipss_api` no tiene DELETE sobre `usuario_sector` ni `usuario_carrera`, y el correo es único. Corregirlo exige una decisión del usuario: dar ese permiso o hacerlo con el rol migrador.

## Próximo paso

C3 respaldo y restauración.
