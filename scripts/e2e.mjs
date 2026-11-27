// Pruebas de punta a punta: levanta la pila completa de infra/compose.yaml bajo un proyecto propio (`ipss-e2e`)
// con secretos aleatorios y puertos libres, siembra los datos de ejemplo, corre Playwright contra el proxy real
// por HTTPS y siempre baja el proyecto con sus volúmenes, también si algo falla.
// No toca ningún otro contenedor ni volumen de la máquina.
// Usa solo módulos de Node para no sumar dependencias.
import { spawnSync } from 'node:child_process';
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

function ejecutar(comando, args, { permitirFallo = false, heredar = false } = {}) {
  const resultado = spawnSync(comando, args, { cwd: raiz, env: entorno, encoding: 'utf8', stdio: heredar ? 'inherit' : 'pipe', maxBuffer: 256 * 1024 * 1024 });
  if (resultado.status !== 0 && !permitirFallo) {
    if (!heredar) {
      console.error(resultado.stdout);
      console.error(resultado.stderr);
    }
    throw new Error(`Falló: ${comando} ${args.slice(0, 8).join(' ')} (código ${String(resultado.status)})`);
  }
  return resultado;
}

const compose = (args, opciones) => ejecutar('docker', ['compose', '-p', PROYECTO, '-f', 'infra/compose.yaml', ...args], opciones);

function restos() {
  const filtro = `label=com.docker.compose.project=${PROYECTO}`;
  const contenedores = ejecutar('docker', ['ps', '-aq', '--filter', filtro], { permitirFallo: true }).stdout.split('\n').filter(Boolean);
  const volumenes = ejecutar('docker', ['volume', 'ls', '-q', '--filter', filtro], { permitirFallo: true }).stdout.split('\n').filter(Boolean);
  return { contenedores: contenedores.length, volumenes: volumenes.length };
}

let codigo = 1;
try {
  paso(`Levantando la pila (${PROYECTO}, https://localhost:${String(puertoHttps)})`);
  compose(['up', '-d', '--build', '--wait']);

  paso('Sembrando los datos de ejemplo dentro del contenedor de la API');
  compose(['exec', '-T', '-e', 'NODE_ENV=development', 'api', 'sh', '-c', 'node dist/cli/semilla.js']);

  paso('Corriendo Playwright (Chromium)');
  // Lo que siga a `npm run e2e --` (un archivo, `--grep`, `--headed`) pasa tal cual a Playwright.
  const extra = process.argv.slice(2);
  codigo = ejecutar('npm', ['run', 'e2e', '-w', '@ipss/e2e', ...(extra.length > 0 ? ['--', ...extra] : [])], { permitirFallo: true, heredar: true }).status ?? 1;
} catch (error) {
  console.error(`\nPRUEBAS DE PUNTA A PUNTA: no se pudieron preparar\n${error instanceof Error ? error.message : String(error)}`);
  console.error(compose(['ps', '-a'], { permitirFallo: true }).stdout);
} finally {
  paso(`Bajando ${PROYECTO} con sus volúmenes`);
  const limpieza = compose(['down', '--volumes', '--remove-orphans'], { permitirFallo: true });
  if (limpieza.status !== 0) console.error(limpieza.stderr);
  const { contenedores, volumenes } = restos();
  console.log(`   contenedores restantes: ${String(contenedores)}, volúmenes restantes: ${String(volumenes)}`);
  process.exitCode = codigo;
}
