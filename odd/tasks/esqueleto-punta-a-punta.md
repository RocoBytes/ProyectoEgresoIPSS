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

- [ ] **T1 Monorepo.** npm workspaces (`apps/api`, `apps/web`, `packages/shared`), versiones del kit, TypeScript estricto, ESLint y scripts en la raíz. ADR 0001.
  - Ruta: delegada a un escritor. Disparador: más de dos archivos no triviales.
  - Verificación: `npm install`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm audit` y comparación de versiones con el kit.
- [ ] **T2 Base de datos.** Esquema completo, migración inicial con la sección 2 literal más la 2.6, roles, `compose.desarrollo.yaml`, 26 pruebas adaptadas y `test:bd`. ADR 0002 a 0005.
  - Ruta: delegada.
  - Verificación:
    - `npm run test:bd` con 26 de 26;
    - `diff` de la sección 2 contra el kit;
    - deriva cero entre esquema y migración;
    - `prisma generate` con `effect` 3.22.1.
- [ ] **T3 API mínima.** NestJS con `ValidationPipe`, helmet, `trust proxy`, filtro de errores y `GET /api/salud` contra la base. Antes del filtro, probar cómo entrega Prisma el 23514. ADR 0006.
  - Ruta: delegada.
  - Verificación: Jest, `curl` a `/api/salud` (200 y 503) y cabeceras.
- [ ] **T4 Web mínima.** React Router con una ruta, TanStack Query sobre `/api/salud`, colores y tipografía del prototipo, `npm run dev`.
  - Ruta: delegada.
  - Verificación: Vitest, `vite build` y `npm run dev` con el proxy.
- [ ] **T5 Infraestructura.** Dockerfiles, Compose con cinco servicios, Caddyfile, CI y sección "Comandos" de `CLAUDE.md`. ADR 0007.
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

## Progreso y evidencia

- 26-11-2026: commit base `8c79d17` en `main` y rama `esqueleto` creada.

## Próximo paso

T1.
