import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

// La URL la entrega `scripts/e2e.mjs`: el puerto se elige libre en cada corrida para no chocar con otros proyectos de la máquina.
const url = process.env['E2E_URL'];
if (url === undefined) {
  throw new Error('Falta E2E_URL. Corre `npm run e2e` desde la raíz: levanta la pila y fija la URL.');
}

export default defineConfig({
  testDir: './pruebas',
  outputDir: './resultados',
  // Los flujos escriben en la misma base; en serie nadie cierra el registro que otro está mirando.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env['CI'] !== undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './informe' }]],
  use: {
    baseURL: url,
    // Caddy firma `localhost` con su propia CA interna, que el navegador de la prueba no conoce.
    ignoreHTTPSErrors: true,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
