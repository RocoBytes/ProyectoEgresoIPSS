# 0020. Pruebas de punta a punta

- Estado: Aceptada
- Fecha: 2026-11-27

## Contexto

Las pruebas de la API (Jest sobre PostgreSQL real) y de la web (Vitest con la API simulada) no comprueban que las dos mitades funcionen juntas detrás del proxy: cookie `Secure` sobre HTTPS, `/api` por Caddy, subida de archivos reales, descarga con sesión y el panel leyendo lo que acaba de escribir el cierre. `CLAUDE.md` pide tres flujos con Playwright.

## Decisión

- **Una dependencia nueva, `@playwright/test` 1.65.1**, exacta, publicada el 13-11-2026 (pasa `min-release-age=7`), sin script de instalación y sin avisos en OSV. `npm audit --omit=dev` y `npm audit signatures` siguen limpios. Chromium se descarga aparte con `npx playwright install chromium`; no se prueban otros navegadores.
- **Un workspace propio, `e2e/`**, con su `package.json`, `tsconfig.json` y `playwright.config.ts`. Así el lint y `npm run typecheck` de la raíz lo cubren sin configuración especial, y la dependencia no entra en `apps/web` ni en `apps/api`. No define el script `test`: `npm test` sigue siendo rápido y no exige Docker más allá de `bd-pruebas`.
- **`npm run e2e`** (`scripts/e2e.mjs`) reutiliza el enfoque de `test:respaldo`: proyecto Compose propio `ipss-e2e`, secretos aleatorios solo en el entorno de los procesos hijos, puertos libres y baja con volúmenes en un `finally`. Levanta la pila completa con `--build --wait`, siembra los datos de ejemplo dentro del contenedor de la API y corre Playwright contra `https://localhost:<puerto>`: Caddy firma `localhost` con su CA interna (de ahí `ignoreHTTPSErrors`) y se prueba el HTTPS real. Todo argumento tras `--` pasa a Playwright.
- **Tres flujos**, localizados por rol y etiqueta, de modo que también comprueban que los controles tengan nombre accesible:
  1. Carla crea una sesión con acta y un registro, y lo encuentra en Registros.
  2. Carla cierra un registro con evidencia y el panel cuenta uno más.
  3. Paula no ve «Nueva sesión» ni acciones sobre un registro y descarga el acta (`%PDF`).
- **Independencia**: cada flujo inicia su propia sesión y elige sus datos en la pantalla (el primer registro abierto del filtro), sin depender de otro flujo. Corren en serie (`workers: 1`) sobre una base que comparten.
- **CI**: el job `e2e` corre después de `verificar`, instala Chromium con sus bibliotecas del sistema y, si falla, sube el informe y los rastros como artefacto durante 7 días.

## Consecuencias

- La corrida completa tarda cerca de un minuto, casi todo en construir las imágenes; `npm run e2e` exige Docker y deja la máquina como la encontró (sin contenedores ni volúmenes del proyecto).
- El flujo 2 mide el panel en el año de la sesión del registro elegido, porque el panel cuenta por año de la sesión y no por fecha de cierre.
- Los flujos dependen de los textos y los datos de ejemplo del prototipo: un cambio de texto en la interfaz rompe la prueba a propósito.
- Una nueva versión mayor de Playwright o de Chromium se actualiza con la misma política de espera de 7 días (ADR 0008).
