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

// Se evita el rango efímero del sistema (`listen(0)`), donde otro proceso puede tomar el puerto antes de que lo publique Docker.
async function puertoLibre() {
  for (let intento = 0; intento < 50; intento += 1) {
    const candidato = 20000 + Math.floor(Math.random() * 10000);
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
  // La restauración revoca a propósito los refresh_token vigentes; por eso su md5 deja fuera `revocado_en`
  // y se comprueba aparte que ninguno quede vigente.
  const fila = (t) => (t === 'refresh_token' ? "(to_jsonb(x) - 'revocado_en')::text" : 'x::text');
  const contenido = psql(tablas.map((t) => `select '${t}', count(*), md5(coalesce(string_agg(${fila(t)}, '|' order by ${fila(t)}), '')) from "${t}" x`).join(' union all '));
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

/** Hora HH:MM de Santiago del minuto en curso: abre la ventana del planificador de inmediato. */
function horaActual() {
  const ahora = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  return ahora.toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Hora HH:MM de Santiago de hace dos horas: deja al planificador fuera de la ventana del respaldo. */
function horaHaceDosHoras() {
  const antes = new Date(Math.floor((Date.now() - 2 * 3600_000) / 60_000) * 60_000);
  return antes.toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Trunca `origen` (un bd.dump) y deja el resultado en `destino`/bd.dump en un punto donde `pg_restore --list` aún
 * funciona pero el flujo de datos muere dentro de un `COPY ... FROM stdin` (el SQL emitido termina con un COPY sin
 * cerrar). Prueba cortes de atrás hacia adelante, cada 3 %, y se queda con el primero que sirve. Recalcula SHA256SUMS
 * para simular un daño que las sumas no detectan.
 */
function cortarDentroDeCopy(origen, destino) {
  const tamano = Number(enRespaldo(`wc -c < ${origen}`).stdout.trim());
  const sondas = [];
  for (let fraccion = 99; fraccion >= 20; fraccion -= 3) {
    const bytes = Math.floor((tamano * fraccion) / 100);
    const sonda = enRespaldo(`
      set -u
      head -c ${String(bytes)} ${origen} > ${destino}/bd.dump
      pg_restore --list ${destino}/bd.dump > /dev/null || { echo "lista=falla"; exit 0; }
      pg_restore --clean --if-exists --file=/tmp/sonda.sql ${destino}/bd.dump 2> /dev/null && { echo "restaura=bien"; exit 0; }
      abiertos=$(grep -c 'FROM stdin;$' /tmp/sonda.sql); cerrados=$(grep -c '^\\\\.$' /tmp/sonda.sql)
      echo "copy_abiertos=$abiertos cerrados=$cerrados"; rm -f /tmp/sonda.sql
    `).stdout.trim();
    sondas.push(`${String(fraccion)} %: ${sonda}`);
    const m = /copy_abiertos=(\d+) cerrados=(\d+)/.exec(sonda);
    if (m && Number(m[1]) > Number(m[2])) {
      enRespaldo(`cd ${destino} && sha256sum bd.dump evidencias.tar > SHA256SUMS`);
      return { fraccion, bytes, tamano, sonda, intentos: sondas.length };
    }
  }
  throw new Error(`Ningún corte dejó un COPY sin cerrar; la prueba no reproduce el caso:\n${sondas.join('\n')}`);
}

/** Ejecuta un script de sh dentro del contenedor `respaldo` y devuelve su salida. */
function enRespaldo(script, variables = {}) {
  const env = Object.entries(variables).flatMap(([clave, valor]) => ['-e', `${clave}=${valor}`]);
  return compose(['exec', '-T', ...env, 'respaldo', 'sh', '-c', script], { permitirFallo: true });
}

async function esperarEnRegistro(patron, segundos, mensaje) {
  for (let i = 0; i < segundos / 3; i += 1) {
    const registro = compose(['logs', '--no-log-prefix', 'respaldo']).stdout;
    if (patron.test(registro)) return registro;
    await dormir(3000);
  }
  throw new Error(`${mensaje} (en ${String(segundos)} s)\n${compose(['logs', '--no-log-prefix', '--tail', '30', 'respaldo']).stdout}`);
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
  const cookieAntigua = cookie;
  const vigentesAntes = Number(psql('select count(*) from refresh_token where revocado_en is null'));
  if (vigentesAntes < 1) throw new Error('Antes del respaldo debía haber al menos un refresh token vigente');
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

  paso('Un reinicio dentro de la ventana no repite el respaldo de hoy');
  entorno.HORA_RESPALDO = horaActual();
  compose(['up', '-d', '--wait', '--force-recreate', '--no-deps', 'respaldo']);
  const trasReinicio = await esperarEnRegistro(/Ya hay un respaldo de hoy/, 30, 'El planificador no reconoció el respaldo de hoy');
  if (/comienza/.test(trasReinicio)) throw new Error('El reinicio dentro de la ventana repitió el respaldo');
  const cuantos = enRespaldo('ls -d /respaldos/20??-??-??_???? | wc -l').stdout.trim();
  if (cuantos !== '1') throw new Error(`Se esperaba 1 respaldo y hay ${cuantos}`);
  console.log('   el planificador vio el respaldo de hoy y no lo repitió (1 directorio)');

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
  const revocados = /Refresh tokens revocados: (\d+)/.exec(restauracion.stdout);
  if (revocados?.[1] !== String(vigentesAntes)) throw new Error(`Se esperaba revocar ${String(vigentesAntes)} tokens y el script informó ${String(revocados?.[1])}`);
  compose(['up', '-d', '--wait']);

  paso('Comparando');
  const despues = fotografiar();
  const diferencias = compararFotos(antes, despues);
  if (diferencias.length > 0) throw new Error(`La base restaurada difiere:\n${diferencias.join('\n')}`);
  console.log(`   ${String(antes.tablas.length)} tablas con conteo y md5 idénticos, permisos, triggers y evidencias idénticos`);

  // Antes de volver a ingresar: el ingreso de la prueba crearía un token vigente nuevo.
  // Las sesiones cerradas después del respaldo no deben revivir: la restauración revoca todo token vigente.
  const vigentes = psql('select count(*) from refresh_token where revocado_en is null');
  if (vigentes !== '0') throw new Error(`Tras restaurar quedaron ${vigentes} refresh tokens vigentes`);
  const viejo = await globalThis.fetch(`${base}/api/acceso/yo`, { headers: { cookie: cookieAntigua } });
  if (viejo.status !== 401) throw new Error(`La sesión anterior a la restauración sigue válida (${String(viejo.status)})`);
  console.log(`   ${String(vigentesAntes)} refresh tokens revocados; la sesión anterior responde 401`);

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

  // Triggers y permisos de verdad: se inserta un registro como ipss_api dentro de una transacción que se deshace.
  for (const nombreTrigger of ['registro_correlativo', 'registro_proteger', 'registro_auditar', 'registro_validar_objeto']) {
    if (!despues.triggers.some((t) => t.startsWith(`${nombreTrigger}|`))) throw new Error(`Falta el trigger ${nombreTrigger} tras restaurar`);
  }
  if (psql("select has_table_privilege('ipss_api', 'registro', 'INSERT')") !== 't') throw new Error('ipss_api perdió INSERT sobre registro');
  const escritura = compose(['exec', '-T', 'bd', 'psql', '-U', 'postgres', '-d', 'ipss', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], {
    entrada: `begin;
set local role ipss_api;
insert into registro (sesion_id, carrera_id, nivel_impacto, asignatura_id, version_malla_id, recurso, descripcion, fecha_comprometida, actualizado_por)
  select sesion_id, carrera_id, nivel_impacto, asignatura_id, version_malla_id, recurso, '__prueba_respaldo__', fecha_comprometida, actualizado_por from registro limit 1;
select correlativo from registro where descripcion = '__prueba_respaldo__';
select count(*) from historial_estado h join registro r on r.id = h.registro_id where r.descripcion = '__prueba_respaldo__';
rollback;
`,
  }).stdout.trim().split('\n');
  if (!/^R-\d{4}-\d{3,}$/.test(escritura[0] ?? '')) throw new Error(`El trigger no asignó el correlativo: ${String(escritura[0])}`);
  if (escritura[1] !== '1') throw new Error(`El trigger de auditoría no escribió el historial (filas: ${String(escritura[1])})`);
  if (psql("select count(*) from registro where descripcion = '__prueba_respaldo__'") !== '0') throw new Error('La inserción de prueba no se deshizo');
  console.log(`   ipss_api insertó un registro (${String(escritura[0])}, historial escrito) y se deshizo; triggers y permisos vivos`);

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

  paso('Si la restauración falla a medias, la base queda como estaba');
  // Una vista de otro dueño que depende de `sesion` hace fallar el DROP en mitad de la transacción.
  psql('create view bloqueo_prueba as select id from sesion');
  const antesAtomica = fotografiar();
  const falla = compose(['--profile', 'restauracion', 'run', '--rm', '--no-TTY', 'restaurar', nombre], { permitirFallo: true });
  if (falla.status === 0) throw new Error('La restauración debía fallar con la vista bloqueando el DROP');
  if (!/una sola transacci/.test(falla.stderr)) throw new Error(`Falta el mensaje de transacción en:\n${falla.stderr}`);
  const trasAtomica = compararFotos(antesAtomica, fotografiar());
  if (trasAtomica.length > 0) throw new Error(`La restauración fallida dejó cambios:\n${trasAtomica.join('\n')}`);
  if (psql("select count(*) from pg_views where viewname = 'bloqueo_prueba'") !== '1') throw new Error('La vista de prueba desapareció');
  psql('drop view bloqueo_prueba');
  console.log(`   código ${String(falla.status)}; ${String(antesAtomica.tablas.length)} tablas, permisos y triggers sin cambios`);

  paso('Un volcado cortado dentro de un bloque de datos no puede confirmarse a medias');
  // `pg_restore --list` solo lee el índice: un volcado truncado en la zona de datos lo pasa, pero el flujo de
  // datos muere dentro de un `COPY ... FROM stdin`. Se busca un corte (fracción del tamaño) donde eso ocurra de
  // verdad: pg_restore falla y el SQL que alcanzó a emitir termina con un COPY sin cerrar.
  const cortado = `${nombre}_cortado`;
  enRespaldo(`rm -rf /respaldos/${cortado}; cp -r ${directorio} /respaldos/${cortado}`);
  const corte = cortarDentroDeCopy(`${directorio}/bd.dump`, `/respaldos/${cortado}`);
  console.log(`   intentos de corte: ${String(corte.intentos)}; corte al ${String(corte.fraccion)} % (${String(corte.bytes)} de ${String(corte.tamano)} bytes): --list pasa, ${corte.sonda}; SHA256SUMS recalculado`);

  const huellaSesiones = () => psql("select count(*) filter (where revocado_en is null), md5(string_agg(coalesce(revocado_en::text, '-'), ',' order by id)) from refresh_token");
  const antesCorte = fotografiar();
  const sesionesAntes = huellaSesiones();
  if (sesionesAntes.startsWith('0|')) throw new Error('Antes del corte debía haber un refresh token vigente para que la comprobación valga');
  const corto = compose(['--profile', 'restauracion', 'run', '--rm', '--no-TTY', 'restaurar', cortado], { permitirFallo: true });
  if (corto.status !== 1) throw new Error(`La restauración del volcado cortado debía salir con 1 y salió con ${String(corto.status)}`);
  if (!/una sola transacci/.test(corto.stderr) || /Refresh tokens revocados/.test(corto.stdout)) throw new Error(`Salida inesperada:\n${corto.stdout}\n${corto.stderr}`);
  const trasCorte = compararFotos(antesCorte, fotografiar());
  if (trasCorte.length > 0) throw new Error(`El volcado cortado dejó cambios en la base:\n${trasCorte.join('\n')}`);
  if (huellaSesiones() !== sesionesAntes) throw new Error('El volcado cortado cambió el estado de revocación de los refresh tokens');
  console.log(`   código ${String(corto.status)}; mismos conteos, md5, permisos y triggers; refresh tokens sin tocar (${sesionesAntes.split('|')[0]} vigentes)`);

  paso('Un COPY de una sola columna no puede tragarse el SQL inyectado');
  // En una tabla de varias columnas las líneas inyectadas fallan solas como filas mal formadas y el corte anterior
  // aborta igual aunque falte el terminador `\.`. Con UNA columna de texto, cualquier línea es una fila válida:
  // sin `\.` psql confirmaría una restauración parcial. Esta escena es la que distingue ambos casos.
  const mono = `${nombre}_monocolumna`;
  const bdMono = 'ipss_cortado';
  compose(['exec', '-T', 'bd', 'psql', '-U', 'postgres', '-d', 'postgres', '-c', `drop database if exists ${bdMono}`, '-c', `create database ${bdMono} owner ipss_migrador`]);
  const sembrarMono = enRespaldo(`
    set -eu
    export PGDATABASE=${bdMono}
    psql -q -c "create table copia as select md5(g::text) || md5(g::text) as m from generate_series(1, 3000) g"
    rm -rf /respaldos/${mono} /tmp/vacio; mkdir /respaldos/${mono} /tmp/vacio
    pg_dump --format=custom --file=/respaldos/${mono}/origen.dump
    tar -C /tmp/vacio -cf /respaldos/${mono}/evidencias.tar .
    psql -q -c "delete from copia where m not in (select m from copia limit 1000)"
  `);
  if (sembrarMono.status !== 0) throw new Error(`No se pudo preparar la base de una columna: ${sembrarMono.stderr}`);
  const corteMono = cortarDentroDeCopy(`/respaldos/${mono}/origen.dump`, `/respaldos/${mono}`);
  enRespaldo(`rm -f /respaldos/${mono}/origen.dump`);
  const psqlMono = (sql) => compose(['exec', '-T', 'bd', 'psql', '-U', 'postgres', '-d', bdMono, '-At', '-c', sql]).stdout.trim();
  const filasAntes = psqlMono('select count(*) from copia');
  if (filasAntes !== '1000') throw new Error(`La tabla de una columna debía tener 1000 filas y tiene ${filasAntes}`);
  const monoFalla = compose(['--profile', 'restauracion', 'run', '--rm', '--no-TTY', '-e', `PGDATABASE=${bdMono}`, 'restaurar', mono], { permitirFallo: true });
  const filasDespues = psqlMono('select count(*) from copia');
  // Las marcas son textos que restaurar.sh inyecta tras una falla de pg_restore (`\echo pg_restore falló…`, la
  // sentencia error_de_restauracion_abortar() y el bloque que imprime REVOCADOS). Si cambian allí, cambiar aquí.
  const basura = psqlMono("select count(*) from copia where m like '%error_de_restauracion_abortar%' or m like '%REVOCADOS%' or m like '%pg_restore falló%'");
  compose(['exec', '-T', 'bd', 'psql', '-U', 'postgres', '-d', 'postgres', '-c', `drop database ${bdMono}`]);
  enRespaldo(`rm -rf /respaldos/${mono} /tmp/vacio`);
  if (monoFalla.status !== 1) throw new Error(`La restauración del volcado de una columna debía salir con 1 y salió con ${String(monoFalla.status)}`);
  if (filasDespues !== filasAntes) throw new Error(`La restauración fallida confirmó filas: antes ${filasAntes}, después ${filasDespues}`);
  if (basura !== '0') throw new Error(`Quedaron ${basura} filas con SQL inyectado dentro de la tabla`);
  console.log(`   corte al ${String(corteMono.fraccion)} %; código ${String(monoFalla.status)}, filas ${filasAntes} -> ${filasDespues}, filas con SQL inyectado: ${basura}`);

  paso('Retención y salud con directorios de prueba (dentro del volumen de respaldos)');
  const retencion = enRespaldo(`
    set -eu
    D=/respaldos/prueba-retencion; rm -rf $D; mkdir $D; now=$(date +%s)
    mk() { mkdir $D/$1; touch -d "@$((now - $2))" $D/$1; }
    mk 2020-01-01_0100 $((14 * 86400 + 3600))   # 14 días y 1 hora: se borra
    mk 2020-01-02_0100 $((13 * 86400 + 82800))  # 13 días y 23 horas: se conserva
    mk 2020-01-03_0100 $((20 * 86400))          # se borra
    mk 2020-01-04_0100 60                       # se conserva
    mk otros $((30 * 86400))                    # no tiene nombre de respaldo: se conserva
    touch -d "@$((now - 30 * 86400))" $D/2020-01-05_0100  # archivo, no directorio: se conserva
    sh /respaldo/respaldar.sh > /dev/null
    ls -A $D
  `, { DIRECTORIO_RESPALDOS: '/respaldos/prueba-retencion', DIAS_RETENCION: '14' });
  if (retencion.status !== 0) throw new Error(`La prueba de retención falló: ${retencion.stderr}`);
  // El respaldo recién hecho también está en el directorio; solo se mira lo que sembró la prueba.
  const quedan = retencion.stdout.trim().split('\n').filter((n) => n.startsWith('2020-') || n === 'otros').sort();
  const esperados = ['2020-01-02_0100', '2020-01-04_0100', '2020-01-05_0100', 'otros'];
  if (JSON.stringify(quedan) !== JSON.stringify(esperados)) throw new Error(`Retención: quedaron ${quedan.join(', ')} y se esperaba ${esperados.join(', ')}`);
  console.log('   retención de 14 días: borró 14d1h y 20d; conservó 13d23h, 60 s, un archivo y un directorio ajeno');

  const escenas = [
    ['instalación nueva (sin respaldos)', 'touch $D/.primer-arranque', 0],
    ['sin respaldos a las 30 h del primer arranque', 'touch -d "@$((now - 108000))" $D/.primer-arranque', 1],
    ['respaldo de 2 h', 'mk 2020-01-01_0100 7200', 0],
    ['respaldo de 30 h', 'mk 2020-01-01_0100 108000', 1],
    ['respaldo reciente con marca de falla', 'mk 2020-01-01_0100 7200; echo falla > $D/.ultimo-fallo', 1],
  ];
  for (const [descripcion, preparar, esperado] of escenas) {
    const salida = enRespaldo(`D=/respaldos/prueba-salud; rm -rf $D; mkdir $D; now=$(date +%s); mk() { mkdir $D/$1; touch -d "@$((now - $2))" $D/$1; }; ${preparar}; sh /respaldo/salud.sh; echo "rc=$?"`, { DIRECTORIO_RESPALDOS: '/respaldos/prueba-salud' });
    const rc = /rc=(\d+)/.exec(salida.stdout)?.[1];
    if (rc !== String(esperado)) throw new Error(`Salud "${descripcion}": se esperaba ${String(esperado)} y salió ${String(rc)}\n${salida.stdout}`);
  }
  console.log(`   salud.sh: ${String(escenas.length)} escenas con el resultado esperado`);

  paso('Falla del respaldo: reintento, reinicio fuera de la ventana y recuperación');
  enRespaldo('rm -rf /respaldos/20??-??-??_???? /respaldos/prueba-* /respaldos/.ultimo-fallo /respaldos/.reintento');
  compose(['stop', 'bd']);
  entorno.HORA_RESPALDO = horaActual();
  entorno.REINTENTO_SEGUNDOS = '20';
  // Intentos de sobra: la escena no depende de cuánto tarde la base en volver.
  entorno.MAX_INTENTOS = '10';
  compose(['up', '-d', '--no-deps', '--force-recreate', 'respaldo']);
  await esperarEnRegistro(/Intento 2 de 10/, 90, 'El planificador no reintentó tras la falla');
  const enFalla = enRespaldo('sh /respaldo/salud.sh');
  if (enFalla.status === 0 || !/falló/.test(enFalla.stdout)) throw new Error(`Con el respaldo fallando debía estar no saludable: ${enFalla.stdout}`);
  console.log(`   reintentó a los 20 s; salud: "${enFalla.stdout.trim()}"`);

  // Reinicio con la hora del respaldo dos horas atrás: la ventana de 300 s ya no aplica y solo el estado guardado
  // en el volumen puede explicar que el planificador siga reintentando.
  entorno.HORA_RESPALDO = horaHaceDosHoras();
  compose(['up', '-d', '--no-deps', '--force-recreate', 'respaldo']);
  await esperarEnRegistro(/Retomo un reintento pendiente/, 30, 'El planificador no retomó el reintento pendiente tras reiniciar');
  const trasReiniciar = enRespaldo('sh /respaldo/salud.sh');
  if (trasReiniciar.status === 0 || !/falló/.test(trasReiniciar.stdout)) throw new Error(`La marca de falla no sobrevivió al reinicio: ${trasReiniciar.stdout}`);
  console.log('   reiniciado fuera de la ventana: retomó el reintento y sigue no saludable (estado en el volumen)');

  compose(['up', '-d', '--wait', '--no-deps', 'bd']);
  await esperarEnRegistro(/Respaldo completo/, 120, 'El planificador no se recuperó al volver la base');
  const sana = enRespaldo('sh /respaldo/salud.sh; test ! -e /respaldos/.reintento && echo sin-estado');
  if (sana.status !== 0 || !/sano/.test(sana.stdout) || !/sin-estado/.test(sana.stdout)) throw new Error(`Tras recuperarse debía estar sano y sin reintento pendiente: ${sana.stdout}`);
  console.log(`   al volver la base respaldó y quedó sano ("${sana.stdout.trim().split('\n')[0]}"), sin reintento pendiente`);

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
