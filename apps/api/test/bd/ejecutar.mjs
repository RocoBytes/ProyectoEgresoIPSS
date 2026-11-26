// Levanta una base de pruebas nueva, aplica las migraciones como migrador y corre las 26 reglas.
// Se escribe en Node (sin dependencias) para que funcione igual en macOS, Linux y Windows.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const raizApi = resolve(import.meta.dirname, '../..');
const raizRepo = resolve(raizApi, '../..');
const compose = resolve(raizRepo, 'infra/compose.desarrollo.yaml');

const URL_MIGRADOR = 'postgresql://ipss_migrador:migrador_dev@127.0.0.1:55433/ipss';
const URL_API = 'postgresql://ipss_api:api_dev@127.0.0.1:55433/ipss';

// En Windows npx es un .cmd y necesita shell; docker y node son ejecutables reales.
const ejecutar = (comando, args, opciones = {}) => {
  const r = spawnSync(comando, args, { stdio: 'inherit', shell: process.platform === 'win32' && comando === 'npx', ...opciones });
  if (r.error) {
    console.error(`No se pudo ejecutar ${comando}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// --force-recreate: la prueba T1 exige una base recién creada. Se deja corriendo al terminar,
// porque las pruebas de Jest de la API usan la misma base.
ejecutar('docker', ['compose', '-f', compose, '--profile', 'pruebas', 'up', '-d', '--force-recreate', '--wait', 'bd-pruebas']);
ejecutar('npx', ['prisma', 'migrate', 'deploy'], { cwd: raizApi, env: { ...process.env, DATABASE_URL_MIGRADOR: URL_MIGRADOR } });
ejecutar('node', ['reglas-bd.mjs'], {
  cwd: import.meta.dirname,
  env: { ...process.env, DATABASE_URL: URL_API, DATABASE_URL_MIGRADOR: URL_MIGRADOR },
});
