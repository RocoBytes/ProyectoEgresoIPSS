# 0008. Defensas de cadena de suministro

- Estado: Aceptada
- Fecha: 2026-11-26

## Contexto

Entre 2025 y 2026, los incidentes más graves del ecosistema npm no fueron fallas en las librerías, sino versiones maliciosas publicadas con cuentas robadas de mantenedores:

- chalk y debug, en septiembre de 2025;
- Shai-Hulud 1 y 2, en septiembre y noviembre de 2025;
- TanStack y @antv, en mayo de 2026;
- keyv, en agosto de 2026.

Casi todas ejecutaban su carga en un script `preinstall` o `postinstall` y estuvieron publicadas entre minutos y horas. En el caso de TanStack, las versiones maliciosas tenían un certificado de origen (*provenance*) válido.

La auditoría del 26-11-2026 encontró además una vulnerabilidad en `effect` 3.20.0, publicada después de la validación del 11-11. Se corrigió con un `override` (ADR 0001).

## Decisión

- **`.npmrc` en la raíz** con tres reglas:
  - `min-release-age=7`: no se instala ninguna versión publicada hace menos de 7 días.
  - `save-exact=true`: toda dependencia nueva queda con versión exacta.
  - `strict-allow-scripts=true`: un script de instalación no aprobado hace fallar la instalación.
- **`allowScripts` en el `package.json` raíz:**
  - Se aprueban `argon2@0.45.2`, `prisma@7.10.1` y `@prisma/engines@7.10.1`, atados a esa versión.
  - Se deniega `fsevents`, que funciona con su binario precompilado.
- **El lockfile se regeneró con la regla de 7 días activa.** Así `@types/node` y `@types/react` volvieron a las versiones del kit (24.19.2 y 19.3.0).
- **Dependabot revisa npm y GitHub Actions cada semana** con la misma espera de 7 días y sin versiones mayores. Las actualizaciones de seguridad no esperan.
- **En CI (punto de control 5):**
  - `npm ci`;
  - `npm audit --omit=dev` como bloqueo;
  - `npm audit signatures`;
  - acciones fijadas por SHA completo;
  - `permissions: contents: read`;
  - sin `pull_request_target`.

## Consecuencias

- Un parche urgente de seguridad publicado hace menos de 7 días no entra con `npm install` normal. Hay que instalarlo a propósito, por ejemplo con `--min-release-age=0` para ese paquete, y dejar constancia en el commit.
- Cambiar de versión `argon2` o Prisma exige volver a aprobar su script con `npm install-scripts approve`. Es una revisión deliberada, no un error.
- `npm ci` respeta el lockfile y no vuelve a aplicar la regla de días. La protección actúa cuando se agregan o actualizan dependencias, y por eso Dependabot usa la misma espera.
- Estas defensas exigen npm 11.20 o superior, que viene con Node 26.13.1.
