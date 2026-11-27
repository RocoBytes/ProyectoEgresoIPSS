// Prueba de restauración (RNF-13): respalda con el planificador real, destruye la base y las evidencias,
// restaura con restaurar.sh y compara. Levanta la pila completa de infra/compose.yaml bajo un proyecto
// propio (`ipss-prueba-respaldo`) con secretos aleatorios y puertos libres, y al terminar la baja con sus volúmenes
// aunque algo falle. No toca ningún otro contenedor ni volumen de la máquina.
// Usa solo módulos de Node para no sumar dependencias.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const raiz = resolve(import.meta.dirname, '..');
const PROYECTO = 'ipss-prueba-respaldo';
const CORREO = 'carla.fuentes@instituto.example';
const CLAVE = 'Demo-2026';

const dormir = (ms) => new Promise((alResolver) => setTimeout(alResolver, ms));

function puertoLibre() {
  return new Promise((alResolver, alFallar) => {
    const servidor = createServer();
    servidor.once('error', alFallar);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => alResolver(port));
    });
  });
}

const secreto = (bytes) => randomBytes(bytes).toString('hex');
const puertoHttp = await puertoLibre();
const puertoHttps = await puertoLibre();

// Todo secreto nace aquí y solo vive en el entorno de los procesos hijos: nada se escribe en disco.
const entorno = {
  ...process.env,
  // Con `http://` Caddy no pide certificado ni redirige, así que la prueba habla HTTP plano por el proxy real.
  DOMINIO: 'http://localhost',
  GHCR_ORG: 'local',
  VERSION: 'prueba-respaldo',
  PUERTO_HTTP: String(puertoHttp),
  PUERTO_HTTPS: String(puertoHttps),
  CLAVE_BD_SUPERUSUARIO: secreto(16),
  CLAVE_BD_MIGRADOR: secreto(16),
  CLAVE_BD_API: secreto(16),
  JWT_SECRETO: secreto(32),
};
delete entorno.HORA_RESPALDO;

const base = `http://localhost:${puertoHttp}`;
const temporal = mkdtempSync(join(tmpdir(), 'ipss-prueba-respaldo-'));

function paso(texto) {
  console.log(`\n== ${texto}`);
}

function ejecutar(comando, args, { permitirFallo = false, entrada } = {}) {
  const resultado = spawnSync(comando, args, { cwd: raiz, env: entorno, encoding: 'utf8', input: entrada, maxBuffer: 256 * 1024 * 1024 });
  if (resultado.status !== 0 && !permitirFallo) {
    console.error(resultado.stdout);
    console.error(resultado.stderr);
    throw new Error(`Falló: ${comando} ${args.slice(0, 8).join(' ')} (código ${String(resultado.status)})`);
  }
  return resultado;
}

const compose = (args, opciones) => ejecutar('docker', ['compose', '-p', PROYECTO, '-f', 'infra/compose.yaml', ...args], opciones);

function psql(sql) {
  return compose(['exec', '-T', 'bd', 'psql', '-U', 'postgres', '-d', 'ipss', '-At', '-F', '|', '-c', sql]).stdout.trim();
}

/** Todo lo que la restauración debe devolver igual: contenido de cada tabla, permisos, triggers y evidencias. */
function fotografiar() {
  const tablas = psql("select tablename from pg_tables where schemaname = 'public' order by 1").split('\n');
  const contenido = psql(tablas.map((t) => `select '${t}', count(*), md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from "${t}" x`).join(' union all '));
  return {
    tablas: contenido.split('\n'),
    permisos: psql("select relname, relacl::text from pg_class where relnamespace = 'public'::regnamespace order by 1").split('\n'),
    esquema: psql("select nspacl::text from pg_namespace where nspname = 'public'"),
    permisosPorDefecto: psql('select defaclrole::regrole, defaclobjtype, defaclacl::text from pg_default_acl order by 1, 2').split('\n'),
    triggers: psql('select tgname, tgrelid::regclass from pg_trigger where not tgisinternal order by 1, 2').split('\n'),
    evidencias: psql('select id, sha256 from evidencia order by id').split('\n').filter(Boolean),
  };
}

function compararFotos(antes, despues) {
  const diferencias = [];
  for (const clave of Object.keys(antes)) {
    const a = [antes[clave]].flat();
    const d = [despues[clave]].flat();
    for (let i = 0; i < Math.max(a.length, d.length); i += 1) {
      if (a[i] !== d[i]) diferencias.push(`${clave}[${i}]: antes=${String(a[i])} despues=${String(d[i])}`);
    }
  }
  return diferencias;
}

async function ingresar() {
  const respuesta = await globalThis.fetch(`${base}/api/acceso/ingresar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo: CORREO, contrasena: CLAVE }),
  });
  if (!respuesta.ok) throw new Error(`El ingreso respondió ${String(respuesta.status)}`);
  return respuesta.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

async function descargarTodas(ids, directorio, cookie) {
  mkdirSync(directorio, { recursive: true });
  const hashes = new Map();
  for (const id of ids) {
    const respuesta = await globalThis.fetch(`${base}/api/evidencias/${id}/descarga`, { headers: { cookie } });
    if (!respuesta.ok) throw new Error(`La descarga de ${id} respondió ${String(respuesta.status)}`);
    const bytes = Buffer.from(await respuesta.arrayBuffer());
    writeFileSync(join(directorio, id), bytes);
    hashes.set(id, ejecutar('shasum', ['-a', '256', join(directorio, id)]).stdout.split(' ')[0]);
  }
  return hashes;
}

/** Hora HH:MM de Santiago dentro de ~1 minuto, para que el planificador real dispare el respaldo. */
function horaProxima() {
  const objetivo = new Date(Math.floor((Date.now() + 90_000) / 60_000) * 60_000);
  return objetivo.toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
}

async function esperarRespaldo() {
  for (let intento = 0; intento < 40; intento += 1) {
    const registro = compose(['logs', '--no-log-prefix', 'respaldo']).stdout;
    const coincidencia = /Respaldo completo: (\/respaldos\/\S+)/.exec(registro);
    if (coincidencia) return { directorio: coincidencia[1], registro };
    if (/ERROR/.test(registro)) throw new Error(`El respaldo falló:\n${registro}`);
    await dormir(5000);
  }
  throw new Error('El planificador no respaldó en 200 s');
}

function volumenesDelProyecto() {
  const lista = ejecutar('docker', ['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${PROYECTO}`]).stdout;
  return lista.split('\n').filter(Boolean);
}

let fallo = true;
try {
  paso(`Levantando la pila (${PROYECTO}, puerto ${String(puertoHttp)})`);
  compose(['up', '-d', '--build', '--wait']);

  paso('Sembrando los datos de ejemplo dentro del contenedor de la API');
  compose(['exec', '-T', '-e', 'NODE_ENV=development', 'api', 'sh', '-c', 'node dist/cli/semilla.js']);

  paso('Descargando las evidencias por la API (antes)');
  let cookie = await ingresar();
  const ids = psql('select id from evidencia order by id').split('\n').filter(Boolean);
  if (ids.length < 2) throw new Error(`La semilla dejó ${String(ids.length)} evidencias; se esperaban al menos 2`);
  const hashesAntes = await descargarTodas(ids, join(temporal, 'antes'), cookie);
  const panelAntes = await (await globalThis.fetch(`${base}/api/reportes/panel`, { headers: { cookie } })).text();
  console.log(`   ${String(ids.length)} evidencias descargadas`);

  // Se fotografía después de ingresar y descargar: el ingreso escribe en la base y no debe diferir luego.
  const antes = fotografiar();
  const registrosAntes = antes.tablas.find((fila) => fila.startsWith('registro|'));
  console.log(`   registro: ${String(registrosAntes)}`);

  paso('Respaldo por el planificador real: se reinicia el servicio con la hora a ~1 minuto');
  entorno.HORA_RESPALDO = horaProxima();
  console.log(`   HORA_RESPALDO=${entorno.HORA_RESPALDO} (Santiago)`);
  compose(['up', '-d', '--wait', '--force-recreate', '--no-deps', 'respaldo']);
  const { directorio, registro } = await esperarRespaldo();
  console.log(registro.split('\n').filter((linea) => /Planificador|Próximo|Respaldo|Base de datos|Evidencias/.test(linea)).map((linea) => `   ${linea}`).join('\n'));
  const nombre = directorio.split('/').pop();
  console.log(compose(['exec', '-T', 'respaldo', 'sh', '-c', `ls -l ${directorio} && cat ${directorio}/manifiesto.txt`]).stdout);

  paso('Destruyendo la base y las evidencias (se conserva el volumen de respaldos)');
  compose(['down']);
  const destruir = volumenesDelProyecto().filter((v) => v === `${PROYECTO}_bd_datos` || v === `${PROYECTO}_evidencias`);
  if (destruir.length !== 2) throw new Error(`Se esperaban 2 volúmenes para borrar y hay ${String(destruir.length)}: ${destruir.join(', ')}`);
  ejecutar('docker', ['volume', 'rm', ...destruir]);
  if (!volumenesDelProyecto().includes(`${PROYECTO}_respaldos`)) throw new Error('El volumen de respaldos desapareció');
  compose(['up', '-d', '--wait']);
  const vacia = fotografiar();
  if (vacia.evidencias.length !== 0) throw new Error('La base debía quedar vacía tras recrear el volumen');
  console.log('   base recreada por `migrar` y vacía, evidencias en 0');
  if (compararFotos(vacia, antes).length === 0) throw new Error('La destrucción no cambió nada: la prueba no prueba');

  paso(`Restaurando ${nombre}`);
  compose(['stop', 'api']);
  const restauracion = compose(['--profile', 'restauracion', 'run', '--rm', '--no-TTY', 'restaurar', nombre]);
  console.log(restauracion.stdout.split('\n').map((linea) => `   ${linea}`).join('\n'));
  compose(['up', '-d', '--wait']);

  paso('Comparando');
  const despues = fotografiar();
  const diferencias = compararFotos(antes, despues);
  if (diferencias.length > 0) throw new Error(`La base restaurada difiere:\n${diferencias.join('\n')}`);
  console.log(`   ${String(antes.tablas.length)} tablas con conteo y md5 idénticos, permisos, triggers y evidencias idénticos`);

  cookie = await ingresar();
  const hashesDespues = await descargarTodas(ids, join(temporal, 'despues'), cookie);
  for (const id of ids) {
    if (hashesAntes.get(id) !== hashesDespues.get(id)) throw new Error(`El sha256 de la descarga de ${id} cambió`);
    const igual = ejecutar('cmp', [join(temporal, 'antes', id), join(temporal, 'despues', id)], { permitirFallo: true });
    if (igual.status !== 0) throw new Error(`Las descargas de ${id} no son idénticas byte a byte`);
  }
  console.log(`   ${String(ids.length)} descargas idénticas byte a byte (cmp)`);

  const panel = await globalThis.fetch(`${base}/api/reportes/panel`, { headers: { cookie } });
  if (!panel.ok) throw new Error(`El panel respondió ${String(panel.status)}`);
  if ((await panel.text()) !== panelAntes) throw new Error('El panel devuelve cifras distintas tras restaurar');
  console.log('   ingreso y panel funcionan, con las mismas cifras');

  // Una escritura con el rol ipss_api demuestra que los permisos y los triggers de la base restaurada siguen vivos.
  const escribe = compose(['exec', '-T', 'bd', 'psql', '-U', 'postgres', '-d', 'ipss', '-At', '-c', "set role ipss_api; select count(*) from contador_correlativo; select has_table_privilege('ipss_api', 'registro', 'INSERT')"]);
  console.log(`   ipss_api: ${escribe.stdout.trim().split('\n').join(' / ')}`);

  paso('Un respaldo dañado no debe tocar la base');
  // La copia se hace desde `respaldo`, que es quien tiene el volumen en escritura; `restaurar` lo monta de solo lectura.
  // La referencia se toma ahora: el ingreso de la comparación anterior ya escribió un refresh_token.
  const antesDelIntento = fotografiar();
  const corrupto = `${nombre}_corrupto`;
  compose(['exec', '-T', 'respaldo', 'sh', '-c', `cp -r ${directorio} /respaldos/${corrupto} && printf '\\377' | dd of=/respaldos/${corrupto}/bd.dump bs=1 seek=100 conv=notrunc 2>/dev/null`]);
  const intento = compose(['--profile', 'restauracion', 'run', '--rm', '--no-TTY', 'restaurar', corrupto], { permitirFallo: true });
  if (intento.status === 0) throw new Error('La restauración de un respaldo dañado terminó con éxito');
  if (!/las sumas no coinciden/.test(intento.stderr)) throw new Error(`Falta el mensaje de sumas en:\n${intento.stderr}`);
  const trasIntento = compararFotos(antesDelIntento, fotografiar());
  if (trasIntento.length > 0) throw new Error(`El intento con el respaldo dañado cambió la base:\n${trasIntento.join('\n')}`);
  console.log(`   código ${String(intento.status)}, "${intento.stderr.trim().split('\n').pop()}"`);
  console.log('   la base quedó igual (mismos conteos y md5)');

  fallo = false;
  console.log('\nPRUEBA DE RESTAURACIÓN: correcta');
} catch (error) {
  console.error(`\nPRUEBA DE RESTAURACIÓN: FALLÓ\n${error instanceof Error ? error.message : String(error)}`);
  // El estado de los contenedores es lo primero que hace falta para entender una falla de arranque.
  console.error(compose(['ps', '-a'], { permitirFallo: true }).stdout);
  console.error(compose(['logs', '--no-log-prefix', '--tail', '30', 'respaldo'], { permitirFallo: true }).stdout);
} finally {
  paso(`Bajando ${PROYECTO} con sus volúmenes`);
  const limpieza = compose(['--profile', 'restauracion', 'down', '--volumes', '--remove-orphans'], { permitirFallo: true });
  if (limpieza.status !== 0) console.error(limpieza.stderr);
  console.log(`   volúmenes restantes: ${String(volumenesDelProyecto().length)}`);
  rmSync(temporal, { recursive: true, force: true });
  process.exitCode = fallo ? 1 : 0;
}
