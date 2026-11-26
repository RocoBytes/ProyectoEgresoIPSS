// Levanta el entorno de desarrollo completo: base, migraciones, API con recarga y web.
// Usa solo módulos de Node para no sumar dependencias.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const dirApi = resolve(raiz, 'apps/api');

// Valores de desarrollo; si el entorno ya define alguno, ese gana.
const entornoDev = {
  DATABASE_URL: 'postgresql://ipss_api:api_dev@127.0.0.1:55432/ipss',
  // Solo para desarrollo local: público en el repositorio, así que nunca sirve fuera de este script.
  JWT_SECRETO: 'secreto-solo-para-desarrollo-local-no-usar-en-produccion',
  PORT: '3000',
  HOST: '127.0.0.1',
};
const entornoApi = { ...entornoDev, ...process.env };
const entornoMigrador = {
  ...process.env,
  DATABASE_URL_MIGRADOR:
    process.env.DATABASE_URL_MIGRADOR ??
    'postgresql://ipss_migrador:migrador_dev@127.0.0.1:55432/ipss',
};

const hijos = new Set();
let cerrando = false;

function cerrarTodo(codigo) {
  if (cerrando) return;
  cerrando = true;
  for (const hijo of hijos) hijo.kill('SIGTERM');
  // Margen para que los hijos terminen solos antes de salir.
  setTimeout(() => process.exit(codigo), 500).unref();
}

function ejecutarPaso(descripcion, comando, args, opciones) {
  console.log(`[dev] ${descripcion}`);
  const resultado = spawnSync(comando, args, { stdio: 'inherit', ...opciones });
  if (resultado.status !== 0) {
    console.error(`[dev] Falló: ${descripcion}`);
    process.exit(resultado.status ?? 1);
  }
}

function lanzar(nombre, comando, args, opciones) {
  const hijo = spawn(comando, args, { stdio: 'inherit', ...opciones });
  hijos.add(hijo);
  hijo.on('exit', (codigo) => {
    hijos.delete(hijo);
    if (!cerrando) {
      console.error(`[dev] ${nombre} terminó (código ${String(codigo)}); se detiene el resto.`);
      cerrarTodo(codigo ?? 1);
    }
  });
  return hijo;
}

process.on('SIGINT', () => cerrarTodo(0));
process.on('SIGTERM', () => cerrarTodo(0));

ejecutarPaso(
  'Levantando la base de desarrollo',
  'docker',
  ['compose', '-f', 'infra/compose.desarrollo.yaml', 'up', '-d', '--wait', 'bd'],
  { cwd: raiz },
);
ejecutarPaso('Generando el cliente de Prisma', 'npx', ['prisma', 'generate'], {
  cwd: dirApi,
  env: entornoMigrador,
});
ejecutarPaso('Aplicando migraciones', 'npx', ['prisma', 'migrate', 'deploy'], {
  cwd: dirApi,
  env: entornoMigrador,
});

lanzar('tsc', 'npx', ['tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], {
  cwd: dirApi,
});

// La API arranca solo cuando el primer build dejó main.js; tsc --watch sigue recompilando.
const archivoPrincipal = resolve(dirApi, 'dist/main.js');
const espera = setInterval(() => {
  if (cerrando) {
    clearInterval(espera);
    return;
  }
  if (!existsSync(archivoPrincipal)) return;
  clearInterval(espera);
  lanzar('API', process.execPath, ['--watch', 'dist/main.js'], { cwd: dirApi, env: entornoApi });
  lanzar('web', 'npm', ['run', 'dev', '-w', '@ipss/web'], { cwd: raiz });
}, 300);
