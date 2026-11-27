// Prueba de las reglas de base de datos con el rol de la API (ipss_api) sobre PostgreSQL 16.
// Requiere una base recién creada (infra/bd/00_roles.sh + migraciones): T1 espera los correlativos 001 y 002.
// Se ejecuta con `npm run test:bd`, que recrea la base de pruebas (puerto 55433) antes de cada corrida.
import pg from 'pg';
import { performance } from 'node:perf_hooks';
const { Pool, Client } = pg;

const api = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://ipss_api:api_dev@127.0.0.1:55433/ipss', max: 20 });
const migrador = new Client({ connectionString: process.env.DATABASE_URL_MIGRADOR ?? 'postgresql://ipss_migrador:migrador_dev@127.0.0.1:55433/ipss' });
await migrador.connect();

// --- Datos base, creados como migrador: la API no tiene INSERT sobre sector, carrera ni canal.
// Los historiales y el registro referencian usuarios por UUID con clave foránea, así que hacen falta usuarios reales.
const idDe = async (sql, params = []) => (await migrador.query(sql, params)).rows[0].id;
const sector = await idDe(`INSERT INTO sector (nombre) VALUES ('Sector de prueba') RETURNING id`);
const carrera = await idDe(`INSERT INTO carrera (sector_id, nombre) VALUES ($1, 'Carrera de prueba') RETURNING id`, [sector]);
const canal = await idDe(`INSERT INTO canal (nombre) VALUES ('Comité sectorial') RETURNING id`);
const crearUsuario = (n) => idDe(
  `INSERT INTO usuario (correo, nombre, hash_contrasena, rol) VALUES ($1, $2, '$argon2id$hash-de-prueba', 'DIRECTOR_CARRERA') RETURNING id`,
  [`u${n}@instituto.example`, `Usuario ${n}`],
);
const u1 = await crearUsuario(1);
const u2 = await crearUsuario(2);
const u3 = await crearUsuario(3);

let ok = 0, fallas = 0;
const paso = (nombre, cond, detalle = '') => {
  cond ? ok++ : fallas++;
  console.log(`${cond ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};
// Ejecuta una consulta que debe fallar y devuelve el código SQLSTATE
const debeFallar = async (sql, params = []) => {
  try { await api.query(sql, params); return null; } catch (e) { return e.code + ' ' + e.message.split('\n')[0]; }
};

// --- T1: sesión con dos registros en una transacción
const c = await api.connect();
await c.query('BEGIN');
const ses = (await c.query(`INSERT INTO sesion (canal_id, fecha, instancia, participantes, creado_por) VALUES ($1, '2026-11-05', 'Comité TI', '{}', $2) RETURNING id`, [canal, u1])).rows[0].id;
const r1 = (await c.query(`INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, descripcion, fecha_comprometida, actualizado_por) VALUES ($1, $2, 'PERFIL_EGRESO', 'Actualizar asignatura A', '2026-12-01', $3) RETURNING id, correlativo, estado`, [ses, carrera, u1])).rows[0];
const r2 = (await c.query(`INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, descripcion, fecha_comprometida, actualizado_por, anio, numero, correlativo, estado, creado_en) VALUES ($1, $2, 'PERFIL_EGRESO', 'Actualizar malla B', '2027-03-01', $3, 1999, 7, 'X-FALSO', 'CERRADO', '2020-01-01') RETURNING id, correlativo, estado, creado_en`, [ses, carrera, u1])).rows[0];
await c.query('COMMIT'); c.release();
const anio = new Intl.DateTimeFormat('en', { timeZone: 'America/Santiago', year: 'numeric' }).format(new Date());
paso('T1 correlativos consecutivos', r1.correlativo === `R-${anio}-001` && r2.correlativo === `R-${anio}-002`, `${r1.correlativo}, ${r2.correlativo}`);
paso('T1 la API no puede forzar correlativo, estado ni fecha de creación', r2.estado === 'ABIERTO' && r2.creado_en.getFullYear() >= 2026, `estado=${r2.estado}`);
const h = (await api.query('SELECT count(*)::int n FROM historial_estado WHERE registro_id = ANY($1)', [[r1.id, r2.id]])).rows[0].n;
paso('T1 historial inicial escrito por trigger', h === 2, `${h} filas`);

// --- T2: lo que el rol de la API no puede hacer
// Los dos casos sobre historial_estado.usuario usan un UUID válido a propósito: con texto, PostgreSQL falla
// con 22P02 (uuid inválido) al convertir el valor, ANTES de comprobar privilegios, y la prueba dejaría de
// demostrar el 42501 que es lo que interesa.
for (const [nombre, sql] of [
  ['DELETE registro', `DELETE FROM registro`],
  ['DELETE evidencia', `DELETE FROM evidencia`],
  ['DELETE historial_estado', `DELETE FROM historial_estado`],
  ['INSERT historial_estado (falsificar historial)', `INSERT INTO historial_estado (registro_id, estado_nuevo, usuario) VALUES ('${r1.id}', 'CERRADO', '${u1}')`],
  ['UPDATE historial_estado', `UPDATE historial_estado SET usuario = '${u2}'`],
  ['UPDATE evidencia', `UPDATE evidencia SET sha256 = repeat('0', 64)`],
  ['TRUNCATE registro', `TRUNCATE registro CASCADE`],
  ['DROP TABLE registro', `DROP TABLE registro CASCADE`],
  ['UPDATE contador_correlativo', `UPDATE contador_correlativo SET ultimo = 0`],
  ['llamar siguiente_correlativo()', `SELECT siguiente_correlativo(2026)`],
  ['ALTER TABLE (quitar el CHECK)', `ALTER TABLE registro DROP CONSTRAINT registro_cierre_completo`],
  ['DISABLE TRIGGER', `ALTER TABLE registro DISABLE TRIGGER registro_proteger`],
]) {
  const err = await debeFallar(sql);
  paso(`T2 denegado: ${nombre}`, !!err && err.startsWith('42501'), err ?? 'SE EJECUTÓ');
}

// --- T3: cierre
let err = await debeFallar(`UPDATE registro SET estado = 'CERRADO', actualizado_por = $2 WHERE id = $1`, [r1.id, u2]);
paso('T3 cerrar sin fecha ni evidencia', !!err && err.startsWith('23514'), err);
err = await debeFallar(`UPDATE registro SET estado = 'CERRADO', fecha_efectiva = '2026-11-20', actualizado_por = $2 WHERE id = $1`, [r1.id, u2]);
paso('T3 cerrar con fecha y sin evidencia', !!err && err.startsWith('23514'), err);
const ev = (await api.query(`INSERT INTO evidencia (sesion_id, nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ($1, 'malla.pdf', 'application/pdf', 1000, repeat('a', 64), 'x/y', $2) RETURNING id`, [ses, u1])).rows[0].id;
await api.query(`UPDATE registro SET estado = 'CERRADO', fecha_efectiva = '2026-11-20', evidencia_cierre_id = $2, actualizado_por = $3 WHERE id = $1`, [r1.id, ev, u2]);
const hist = (await api.query(`SELECT estado_anterior, estado_nuevo, usuario FROM historial_estado WHERE registro_id = $1 ORDER BY id`, [r1.id])).rows;
paso('T3 cierre válido deja historial', hist.length === 2 && hist[1].estado_nuevo === 'CERRADO' && hist[1].usuario === u2, JSON.stringify(hist[1]));

// --- T4: un registro cerrado no se toca
err = await debeFallar(`UPDATE registro SET descripcion = 'cambiada', actualizado_por = $2 WHERE id = $1`, [r1.id, u3]);
paso('T4 editar un registro cerrado', !!err && err.startsWith('23514'), err);
err = await debeFallar(`UPDATE registro SET estado = 'ANULADO', motivo_anulacion = 'x', fecha_efectiva = NULL, actualizado_por = $2 WHERE id = $1`, [r1.id, u3]);
paso('T4 anular un registro cerrado', !!err && err.startsWith('23514'), err);

// --- T5: anulación
err = await debeFallar(`UPDATE registro SET estado = 'ANULADO', motivo_anulacion = '   ', actualizado_por = $2 WHERE id = $1`, [r2.id, u2]);
paso('T5 anular sin motivo', !!err && err.startsWith('23514'), err);

// --- T6: edición de un registro abierto queda en historial_cambio
await api.query(`UPDATE registro SET fecha_comprometida = '2027-06-30', actualizado_por = $2 WHERE id = $1`, [r2.id, u2]);
const cam = (await api.query(`SELECT usuario, cambios FROM historial_cambio WHERE registro_id = $1`, [r2.id])).rows;
paso('T6 mover la fecha comprometida deja huella', cam.length === 1 && cam[0].cambios.fecha_comprometida?.antes === '2027-03-01', JSON.stringify(cam[0]));

// --- T7: correlativo inmutable
err = await debeFallar(`UPDATE registro SET correlativo = 'R-2026-999', actualizado_por = $2 WHERE id = $1`, [r2.id, u2]);
paso('T7 cambiar el correlativo', !!err && err.startsWith('23514'), err);

// --- T8: concurrencia: 200 inserciones en paralelo con 20 conexiones y cerca de 10 % de rollbacks
const antes = (await api.query('SELECT count(*)::int n FROM registro')).rows[0].n;
let confirmadas = 0;
const t0 = performance.now();
await Promise.all(Array.from({ length: 200 }, async (_, i) => {
  const cl = await api.connect();
  try {
    await cl.query('BEGIN');
    await cl.query(`INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, descripcion, fecha_comprometida, actualizado_por) VALUES ($1, $2, 'PERFIL_EGRESO', $3, '2027-01-15', $4)`, [ses, carrera, 'Registro concurrente ' + i, u3]);
    if (i % 10 === 3) { await cl.query('ROLLBACK'); } else { await cl.query('COMMIT'); confirmadas++; }
  } finally { cl.release(); }
}));
const ms = Math.round(performance.now() - t0);
const nums = (await api.query('SELECT numero FROM registro WHERE anio = $1 ORDER BY numero', [Number(anio)])).rows.map(r => r.numero);
const sinSaltos = nums.every((n, i) => n === i + 1);
paso('T8 200 inserciones concurrentes: sin duplicados ni saltos', nums.length === antes + confirmadas && sinSaltos, `${confirmadas} confirmadas, 20 revertidas, numeración 1..${nums.at(-1)} en ${ms} ms`);

// --- T9: cambio de año
const y1 = (await migrador.query('SELECT siguiente_correlativo(2027) n')).rows[0].n;
const y2 = (await migrador.query('SELECT siguiente_correlativo(2027) n')).rows[0].n;
await migrador.query('DELETE FROM contador_correlativo WHERE anio = 2027');
paso('T9 el contador de 2027 nace solo', y1 === 1 && y2 === 2, `${y1}, ${y2}`);
const borde = (await api.query(`SELECT extract(year FROM (timestamptz '2027-01-01 02:30:00+00' AT TIME ZONE 'America/Santiago'))::int a`)).rows[0].a;
paso('T9 31-dic 23:30 en Santiago (01-ene 02:30 UTC) sigue siendo 2026', borde === 2026, String(borde));

// --- T10: la trampa de las fechas sin hora en JavaScript
const f = new Date('2026-12-01'); // lo que entrega Prisma para un campo @db.Date
const mostrada = f.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
console.log(`INFO  T10 fecha comprometida 2026-12-01 leída como Date y mostrada en hora de Santiago: ${mostrada}`);

console.log(`\nResultado: ${ok} correctas, ${fallas} fallas (Node ${process.version}, ${(await api.query('show server_version')).rows[0].server_version})`);
await api.end(); await migrador.end();
process.exit(fallas ? 1 : 0);
