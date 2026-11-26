# 0001. Monorepo con npm workspaces

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

La plataforma tiene una API, una web y tipos que ambas comparten, mantenidos por un equipo de tres personas. Se necesita una sola instalación, un solo lint y un solo conjunto de comandos para todo el código. El kit de validación del 11-11-2026 ya probó las versiones de dependencias que se usarán.

## Decisión

- Se usan npm workspaces con tres espacios: `packages/shared`, `apps/api` y `apps/web`.
- `tsconfig.base.json` en la raíz fija las opciones estrictas (`strict`, `noUncheckedIndexedAccess`, entre otras); cada workspace la extiende.
- ESLint usa configuración plana en la raíz, con reglas que requieren información de tipos (`no-floating-promises`, `switch-exhaustiveness-check`, `no-explicit-any`).
- Las versiones de dependencias se copian tal cual del kit del 11-11-2026, sin actualizarlas.
- `overrides` vive en el `package.json` raíz, porque npm lo ignora dentro de un workspace. Incluye `uuid` 11.1.1 (requerido por `exceljs`) y `effect` 3.22.1, parche de seguridad aprobado para GHSA-7589-6fvf-x4pw, que llega por `@prisma/config`.
- `prisma` pasa de `devDependencies` a `dependencies` de la API, porque el contenedor `migrar` ejecuta la CLI desde la imagen de producción. El detalle se documentará en un ADR 0007.
- `packages/shared` exporta solo tipos, sin build: se borran al compilar en la API y en la web, y el lint obliga a importarlos con `import type`. Así no hay código compartido que empaquetar ni versionar.
- Node 26.13.1 (versión de seguridad del 2026-11-10), aprobada por el usuario y fijada en `.nvmrc` y en `engines`.

## Consecuencias

- Un solo `npm install` y los comandos `lint`, `typecheck`, `build` y `test` de la raíz cubren todos los workspaces.
- Cambiar una versión del kit exige una decisión explícita y, si afecta reglas de base o seguridad, nuevas pruebas.
- El paquete compartido no puede contener lógica en tiempo de ejecución; si algún día la necesita, habrá que añadirle un build y revisar este ADR.
- Los parches de seguridad por `overrides` deben revisarse en cada actualización de Prisma, para retirarlos cuando ya no hagan falta.
