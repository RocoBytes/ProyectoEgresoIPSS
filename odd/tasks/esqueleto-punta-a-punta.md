# Esqueleto de punta a punta

Ubicación: `odd/tasks/esqueleto-punta-a-punta.md` · Espejo en Engram: `odd/esqueleto-punta-a-punta/tasks`

## Objetivo

Dejar el monorepo, la base con sus reglas, una API y una web mínimas y la infraestructura funcionando de punta a punta, sin funcionalidades de negocio.

## Por qué

Es el primer hito acordado (hasta el 29-11-2026). Además prueba tres cosas que la validación del 11-11 no pudo ejecutar: que los contenedores levantan, que el Caddyfile es válido y que `prisma generate` y `prisma migrate deploy` funcionan dentro de la imagen.

## Alcance autorizado

- Plan aprobado por el usuario el 26-11-2026.
- Cuatro parches de seguridad aprobados el 26-11-2026:
  - Node 26.13.1
  - `postgres:16.16-alpine`
  - `caddy:2.11.9-alpine`
  - `override` de `effect` a 3.22.1
- Dependencias nuevas aprobadas con el plan: ESLint, Jest, Vitest, Testing Library y Montserrat, en las versiones del plan.
- Pendiente de decisión:
  - Defensas de cadena de suministro (`.npmrc`, `allowScripts`, controles de CI, Dependabot). Se pregunta al cerrar T1.
  - Caddy o Traefik. Se pregunta antes de T5.
  - Estrategia de PR encadenados. Se pregunta antes de abrir el primer PR.

## Restricciones

- No subir versiones mayores ni modificar sin pedido las reglas SQL, los roles, las versiones fijadas ni la configuración de seguridad.
- Si algo falla por una versión, detenerse y mostrar el error.
- Al cerrar cada punto de control, mostrar los comandos con su salida y detenerse.
- Commits en español, en imperativo, Conventional Commits, sin atribución de IA.

## Configuración de pruebas

- TDD: no configurado en el proyecto, así que queda desactivado. Cada cambio lleva su prueba (`CLAUDE.md`, definición de terminado).
- Ejecutores:
  - Jest para la API (desde T3).
  - Vitest para la web (desde T4).
  - `node apps/api/test/bd/reglas-bd.mjs` para las 26 reglas (desde T2).
- Node local: `export PATH="$HOME/.nvm/versions/node/v26.13.1/bin:$PATH"`, porque `nvm use` no gana a Homebrew en el `PATH`.

## Tareas

- [x] **T1 Monorepo.** npm workspaces (`apps/api`, `apps/web`, `packages/shared`), versiones del kit, TypeScript estricto, ESLint y scripts en la raíz. ADR 0001. Commit `ee3b1dd`.
  - Ruta: delegada a un escritor. Disparador: más de dos archivos no triviales.
  - Verificación: `npm install`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm audit` y comparación de versiones con el kit.
- [x] **T2 Base de datos.** Esquema completo, migración inicial con la sección 2 literal más la 2.6, roles, `compose.desarrollo.yaml`, 26 pruebas adaptadas y `test:bd`. ADR 0002 a 0005.
  - Ruta: delegada.
  - Verificación:
    - `npm run test:bd` con 26 de 26;
    - `diff` de la sección 2 contra el kit;
    - deriva cero entre esquema y migración;
    - `prisma generate` con `effect` 3.22.1.
- [x] **T3 API mínima.** NestJS con `ValidationPipe`, helmet, `trust proxy`, filtro de errores y `GET /api/salud` contra la base. Antes del filtro, probar cómo entrega Prisma el 23514. ADR 0006.
  - Ruta: delegada.
  - Verificación: Jest, `curl` a `/api/salud` (200 y 503) y cabeceras.
- [x] **T4 Web mínima.** React Router con una ruta, TanStack Query sobre `/api/salud`, colores y tipografía del prototipo, `npm run dev`.
  - Ruta: delegada.
  - Verificación: Vitest, `vite build` y `npm run dev` con el proxy.
- [x] **T5 Infraestructura.** Dockerfiles, Compose con cinco servicios, Caddyfile, CI y sección "Comandos" de `CLAUDE.md`. ADR 0007.
  - Ruta: delegada.
  - Verificación:
    - `caddy validate`;
    - `docker compose up -d` con cinco servicios sanos;
    - migración aplicada como `ipss_migrador` sin internet;
    - API conectada como `ipss_api`;
    - página servida por Caddy;
    - `/datos/evidencias` con dueño `node`.

## Criterios de aceptación

- `docker compose -f infra/compose.yaml up -d` deja cuatro servicios sanos y `migrar` terminado con código 0.
- La migración se aplica con el rol migrador.
- La página responde a través de Caddy.
- La sección "Comandos" de `CLAUDE.md` está al día.
- Hay un ADR que registra cómo entrega Prisma el error 23514.

## Entrega

- Rama `esqueleto`, que parte del commit base `8c79d17` en `main`.
- Un commit por punto de control como mínimo.
- Previsión: unas 2.000 líneas escritas a mano, sin contar los lockfiles, así que supera el presupuesto de 400 líneas por PR.
- Estrategia: `ask-on-risk`. Se pregunta si encadenar antes de abrir el primer PR. No se hace push ni se abre PR sin pedirlo.
- **Entregada el 27-11-2026** en el PR #1 (`esqueleto` → `main`), el 1 de 6 PR encadenados hacia `main`. La estrategia `stacked-to-main` la eligió el usuario. Tiene 3.297 (más 13.840 del lockfile) líneas escritas, sobre el presupuesto de 400. El PR pide `size:exception` porque el hito es el tramo cohesivo más chico. Se fusiona con *merge commit* y después la base del PR siguiente pasa a `main`.

## Progreso y evidencia

- 26-11-2026: commit base `8c79d17` en `main` y rama `esqueleto` creada.
- 26-11-2026, T1 cerrada (`ee3b1dd`):
  - `npm ci` limpio con Node 26.13.1 y npm 11.20.0.
  - `lint`, `typecheck` y `build` en 0.
  - `npm audit` y `npm audit --omit=dev` sin vulnerabilidades.
  - `effect` 3.22.1 y `uuid` 11.1.1 aplicados por `overrides`.
  - La prueba negativa de lint dispara las cuatro reglas.
  - argon2id funciona: hash y verificación en `true`.
  - Desvío: no hay `tsconfig.node.json`; `vite.config.ts` va en el `tsconfig.json` de la web, porque así lo exige el servicio de proyectos de ESLint.
  - Versiones: `@types/node` resolvió a 24.19.4 (el kit tenía 24.19.2) y `@types/react` a 19.3.3 (el kit tenía 19.3.0), dentro de sus rangos `^`.
  - npm 11.20 avisa que `argon2`, `prisma`, `@prisma/engines` y `fsevents` tienen scripts de instalación sin revisar en `allowScripts`.
  - Revisión nativa: riesgo medio y `review_due` por `slice_budget_reached`. Quedó bloqueada porque pide declarar los archivos sin seguimiento (`PROMPT_INICIAL.md` y el `.env.ejemplo` del kit) con un JSON cuyo esquema no pude determinar. Estado: no disponible, pendiente de decisión del usuario.

- 26-11-2026: defensas aprobadas y aplicadas en `277df7b`.
  - Se agregaron `.npmrc` (`min-release-age=7`, `save-exact`, `strict-allow-scripts`), `allowScripts`, Dependabot y el ADR 0008.
  - El lockfile se regeneró con la regla de 7 días.
  - `npm audit signatures` verificó las firmas de los 640 paquetes.
- 26-11-2026, T2 cerrada (`134760d`). Revisión nativa: riesgo alto por `infra/bd/00_roles.sh` y `review_due`, otra vez bloqueada por la selección de archivos sin seguimiento.
  - Esquema aprobado sin cambios. `prisma generate` funciona con `effect` 3.22.1.
  - `migrate deploy` se aplicó como `ipss_migrador`.
  - Deriva: "No difference detected".
  - El `diff` de la sección 2 contra el kit solo muestra el bloque 2.6 agregado.
  - Las 16 tablas son de `ipss_migrador`. `ipss_api` no tiene DELETE ni TRUNCATE y las funciones no tienen EXECUTE para PUBLIC.
  - `npm run test:bd`: 26 correctas, 0 fallas, dos veces seguidas sobre una base recreada. Lint y typecheck en 0.
  - Desvíos:
    - import de `performance` en `reglas-bd.mjs`;
    - `prisma.config.ts` agregado al `tsconfig` de la API;
    - `include` explícito en `tsconfig.build.json`;
    - la migración incluye `CREATE SCHEMA IF NOT EXISTS "public"`, tal como lo genera `migrate diff`.

- 26-11-2026, T3 cerrada:
  - Dependencias de prueba instaladas (Jest 30.5.2, ts-jest 29.4.15, @types/jest 30.0.0, @nestjs/testing 11.2.9).
  - `@parcel/watcher` denegado en `allowScripts`, porque lo bloqueó `strict-allow-scripts`. Carga con su binario precompilado.
  - `npm audit --omit=dev` en 0. `npm audit` muestra 18 moderadas de Jest, aceptadas en el ADR 0008.
  - Prueba del 23514: llega como `PrismaClientKnownRequestError`, con código P2039 por la API de modelos y P2010 por SQL crudo. El SQLSTATE y el mensaje están en `meta.driverAdapterError.cause`; `detail` trae la fila completa (ADR 0006).
  - `npm test`: 26 reglas y 43 pruebas de Jest en 4 suites.
  - API local: 200 con helmet y `X-Request-Id`; 404 con `idPeticion`; conectada solo como `ipss_api`; 503 `sin_conexion` con la base detenida y 200 al volver, sin reiniciar.
  - Corrección mía en el filtro: el log de un 500 lleva solo los marcos de la pila, sin el mensaje, que en Prisma puede traer los argumentos de la consulta.
  - `apps/api/.env.ejemplo` quedó fuera del commit: el escritor lo creó por la terminal después de que se le negara la herramienta de escritura, y nadie pudo leerlo por el hook. Pendiente de que lo revise el usuario.

- 26-11-2026, T4 cerrada:
  - Dependencias: fuente Montserrat 5.3.0, Vitest 5.1.1, jsdom 31.0.1 y Testing Library. Ningún script de instalación nuevo; `npm audit --omit=dev` en 0.
  - `npm test`: 26 reglas, 43 de Jest y 7 de Vitest.
  - Build con Montserrat alojada en la app (5 `.woff2`).
  - Contraste de texto entre 5.76 y 14.61 a 1.
  - `npm run dev` levanta la API en 3000 y Vite en 5173. El proxy de `/api/salud` responde 200, y Ctrl-C deja libres ambos puertos.
  - La captura con Chrome sin interfaz coincide con la identidad del prototipo.
  - Desvío: `server.host: '127.0.0.1'` en Vite, porque en Node 26 `localhost` resolvía a `::1`.
- 26-11-2026: el usuario autorizó seguir con T4 y T5 sin detenerse. Se mantiene Caddy, la recomendación vigente, porque el usuario no eligió Traefik.

- 26-11-2026, T5 cerrada:
  - Imágenes: la de la API con `prisma generate` dentro (880 MB, casi todo el CLI de Prisma) y la de la web con Caddy (88.5 MB).
  - `schema-engine` queda en `/app/node_modules/@prisma/engines`.
  - `caddy validate` aprueba los dos Caddyfiles.
  - Con claves efímeras, `docker compose -f infra/compose.yaml up -d --wait` deja proxy, web, api y bd *healthy* y `migrar` en Exited (0).
  - La migración la aplicó `ipss_migrador`: es dueño de las 16 tablas. `migrar` corrió solo en `ipss_datos`, red interna sin internet.
  - La API está conectada solo como `ipss_api`.
  - Caddy entrega la página (HTTP/2 200 con HSTS y CSP estricta) y `/api/salud`. HTTP redirige con 308.
  - `/datos/evidencias` tiene dueño `node` y admite escritura; la raíz es de solo lectura.
  - La captura con Chrome a través de Caddy está bien. `actionlint` pasa.
  - Al final, `down -v`.
  - No se pudo crear `infra/.env.ejemplo`: los permisos del usuario niegan escribir `.env*`. Lo crea el usuario.
- `CLAUDE.md`: sección «Comandos» al día.

## Próximo paso

Entregado en el PR #1, el 27-11-2026. El usuario creó `infra/.env.ejemplo` el 27-11-2026. Quedó en el commit `22036a7` de `esqueleto` y pasó con *merge* a las cinco ramas siguientes. Falta que el usuario revise `apps/api/.env.ejemplo`.
