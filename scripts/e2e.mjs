// Pruebas de punta a punta: levanta la pila completa de infra/compose.yaml bajo un proyecto propio (`ipss-e2e`)
// con secretos aleatorios y puertos libres, siembra los datos de ejemplo, corre Playwright contra el proxy real
// por HTTPS y siempre baja el proyecto con sus volúmenes, también si algo falla o si llega Ctrl-C o SIGTERM.
// No toca ningún otro contenedor ni volumen de la máquina.
// Usa solo módulos de Node para no sumar dependencias.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';

const raiz = resolve(import.meta.dirname, '..');
const PROYECTO = 'ipss-e2e';

// Se evita el rango efímero del sistema (`listen(0)`), donde otro proceso puede tomar el puerto antes de que lo publique Docker.
async function puertoLibre(excluir = []) {
  for (let intento = 0; intento < 50; intento += 1) {
    const candidato = 20000 + Math.floor(Math.random() * 10000);
    if (excluir.includes(candidato)) continue;
    const libre = await new Promise((alResolver) => {
      const servidor = createServer();
      servidor.once('error', () => alResolver(false));
      servidor.listen(candidato, '0.0.0.0', () => servidor.close(() => alResolver(true)));
    });
    if (libre) return candidato;
  }
  throw new Error('No encontré un puerto libre entre 20000 y 29999');
}

const secreto = (bytes) => randomBytes(bytes).toString('hex');
const puertoHttp = await puertoLibre();
const puertoHttps = await puertoLibre([puertoHttp]);

// Todo secreto nace aquí y solo vive en el entorno de los procesos hijos: nada se escribe en disco.
const entorno = {
  ...process.env,
  // Con `localhost` Caddy emite un certificado de su CA interna: se prueba el HTTPS real (la cookie de sesión es Secure).
  DOMINIO: 'localhost',
  GHCR_ORG: 'local',
  VERSION: 'e2e',
  PUERTO_HTTP: String(puertoHttp),
  PUERTO_HTTPS: String(puertoHttps),
  CLAVE_BD_SUPERUSUARIO: secreto(16),
  CLAVE_BD_MIGRADOR: secreto(16),
  CLAVE_BD_API: secreto(16),
  JWT_SECRETO: secreto(32),
  E2E_URL: `https://localhost:${String(puertoHttps)}`,
};

function paso(texto) {
  console.log(`\n== ${texto}`);
}

// Se usa `spawn` asíncrono: con `spawnSync` el proceso no atiende señales mientras dura el `up --build`.
let hijoActual = null;
function ejecutar(comando, args, { permitirFallo = false, heredar = false } = {}) {
  return new Promise((alResolver, alRechazar) => {
    const hijo = spawn(comando, args, { cwd: raiz, env: entorno, stdio: heredar ? 'inherit' : 'pipe' });
    hijoActual = hijo;
    let stdout = '';
    let stderr = '';
    hijo.stdout?.on('data', (d) => (stdout += d));
    hijo.stderr?.on('data', (d) => (stderr += d));
    hijo.once('error', alRechazar);
    hijo.once('close', (status) => {
      hijoActual = null;
      if (status !== 0 && !permitirFallo) {
        if (!heredar) console.error(stdout, stderr);
        alRechazar(new Error(`Falló: ${comando} ${args.slice(0, 8).join(' ')} (código ${String(status)})`));
      } else alResolver({ status: status ?? 1, stdout, stderr });
    });
  });
}

const compose = (args, opciones) => ejecutar('docker', ['compose', '-p', PROYECTO, '-f', 'infra/compose.yaml', ...args], opciones);

async function restos() {
  const filtro = `label=com.docker.compose.project=${PROYECTO}`;
  const contenedores = (await ejecutar('docker', ['ps', '-aq', '--filter', filtro], { permitirFallo: true })).stdout.split('\n').filter(Boolean);
  const volumenes = (await ejecutar('docker', ['volume', 'ls', '-q', '--filter', filtro], { permitirFallo: true })).stdout.split('\n').filter(Boolean);
  return { contenedores: contenedores.length, volumenes: volumenes.length };
}

// La misma promesa para todos los llamadores: la bajada nunca corre dos veces a la vez.
let bajada = null;
function bajar() {
  bajada ??= (async () => {
    paso(`Bajando ${PROYECTO} con sus volúmenes`);
    try {
      const limpieza = await compose(['down', '--volumes', '--remove-orphans'], { permitirFallo: true });
      if (limpieza.status !== 0) console.error(limpieza.stderr);
      const { contenedores, volumenes } = await restos();
      console.log(`   contenedores restantes: ${String(contenedores)}, volúmenes restantes: ${String(volumenes)}`);
    } catch (error) {
      console.error(`No se pudo bajar ${PROYECTO}: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
  return bajada;
}

/** Últimas líneas de los servicios que explican la mayoría de las fallas, antes de que la bajada las borre. */
async function mostrarRegistros() {
  try {
    console.error(`\n== Últimas líneas de api y proxy`);
    console.error((await compose(['logs', '--no-color', '--tail', '40', 'api', 'proxy'], { permitirFallo: true })).stdout);
  } catch (error) {
    console.error(`No se pudieron leer los registros: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const [senal, numero] of [['SIGINT', 2], ['SIGTERM', 15]]) {
  process.on(senal, () => {
    console.error(`\nRecibí ${senal}: interrumpo y bajo ${PROYECTO}`);
    hijoActual?.kill('SIGTERM');
    void bajar().finally(() => process.exit(128 + numero));
  });
}

let codigo = 1;
try {
  paso(`Levantando la pila (${PROYECTO}, https://localhost:${String(puertoHttps)})`);
  await compose(['up', '-d', '--build', '--wait']);

  paso('Sembrando los datos de ejemplo dentro del contenedor de la API');
  await compose(['exec', '-T', '-e', 'NODE_ENV=development', 'api', 'sh', '-c', 'node dist/cli/semilla.js']);

  paso('Corriendo Playwright (Chromium)');
  // Lo que siga a `npm run e2e --` (un archivo, `--grep`, `--headed`) pasa tal cual a Playwright.
  const extra = process.argv.slice(2);
  codigo = (await ejecutar('npm', ['run', 'e2e', '-w', '@ipss/e2e', ...(extra.length > 0 ? ['--', ...extra] : [])], { permitirFallo: true, heredar: true })).status;
  if (codigo !== 0) await mostrarRegistros();
} catch (error) {
  console.error(`\nPRUEBAS DE PUNTA A PUNTA: no se pudieron preparar\n${error instanceof Error ? error.message : String(error)}`);
  await mostrarRegistros();
} finally {
  // El código de Playwright se fija antes y ninguna falla de la bajada lo cambia.
  await bajar();
  process.exitCode = codigo;
}
