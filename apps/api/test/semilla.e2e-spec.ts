import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { ContrasenasService } from '../src/acceso/contrasenas.service';
import { CARRERAS_EJEMPLO, CLAVE_EJEMPLO, USUARIOS_EJEMPLO } from '../src/cli/datos-ejemplo';
import { MALLAS_EJEMPLO, SESIONES_EJEMPLO, USUARIOS_INACTIVOS_EJEMPLO } from '../src/cli/datos-sesiones-ejemplo';
import { sembrar } from '../src/cli/semilla';
import { PrismaClient } from '../src/generated/prisma/client';
import { URL_API, conMigrador } from './ayudas/acceso';

const TABLAS = ['sector', 'carrera', 'asignatura', 'canal', 'usuario', 'usuario_sector', 'usuario_carrera'] as const;

async function contar(cliente: Client): Promise<Record<string, number>> {
  const cuentas: Record<string, number> = {};
  for (const tabla of TABLAS) cuentas[tabla] = Number((await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabla}`)).rows[0]?.n);
  return cuentas;
}

describe('semilla de desarrollo (contra la base de pruebas, como ipss_api)', () => {
  let prisma: PrismaClient;

  let directorio: string;
  beforeAll(async () => {
    // Los archivos de relleno van a un directorio propio de la prueba, no al de desarrollo.
    directorio = await mkdtemp(join(tmpdir(), 'ipss-semilla-'));
    process.env['DIRECTORIO_EVIDENCIAS'] = directorio;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_API }) });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    delete process.env['DIRECTORIO_EVIDENCIAS'];
    await rm(directorio, { recursive: true, force: true });
  });

  it('siembra las 11 sesiones, los 19 registros y las 10 mallas del prototipo una sola vez', async () => {
    const primera = await sembrar(prisma);
    const segunda = await sembrar(prisma);
    expect(SESIONES_EJEMPLO).toHaveLength(11);
    expect(SESIONES_EJEMPLO.reduce((n, x) => n + x.registros.length, 0)).toBe(19);
    expect(MALLAS_EJEMPLO).toHaveLength(10);
    // Si otra suite ya sembró esta base, la primera corrida no agrega nada; en ambos casos la segunda no cambia nada.
    expect(segunda.datosDelPrototipo).toEqual({ usuariosInactivos: 0, mallas: 0, sesiones: 0, registros: 0 });
    expect([0, 11]).toContain(primera.datosDelPrototipo.sesiones);
    await conMigrador(async (c) => {
      const instancias = SESIONES_EJEMPLO.map((x) => x.instancia);
      const r = await c.query<{ sesiones: string; registros: string; cerrados: string; anulados: string }>(
        `SELECT count(DISTINCT s.id) AS sesiones, count(r.id) AS registros,
                count(r.id) FILTER (WHERE r.estado = 'CERRADO') AS cerrados, count(r.id) FILTER (WHERE r.estado = 'ANULADO') AS anulados
           FROM sesion s JOIN registro r ON r.sesion_id = s.id WHERE s.instancia = ANY($1)`, [instancias]);
      expect(r.rows[0]).toEqual({ sesiones: '11', registros: '19', cerrados: '9', anulados: '1' });
      const inactivos = await c.query<{ activo: boolean }>('SELECT activo FROM usuario WHERE correo = ANY($1)', [USUARIOS_INACTIVOS_EJEMPLO.map((u) => u.correo)]);
      expect(inactivos.rows).toHaveLength(2);
      expect(inactivos.rows.every((u) => !u.activo)).toBe(true);
      const mallas = await c.query<{ n: string }>("SELECT count(*) AS n FROM version_malla WHERE vigente_desde IS NOT NULL AND carrera_id IN (SELECT id FROM carrera WHERE nombre = ANY($1))", [MALLAS_EJEMPLO.map((m) => m.carrera)]);
      expect(Number(mallas.rows[0]?.n)).toBeGreaterThanOrEqual(10);
    });
    if (primera.datosDelPrototipo.sesiones === 11) expect((await readdir(directorio)).filter((n) => n !== '.entrantes').length).toBeGreaterThan(30);
  });

  it('cargada dos veces, la segunda no cambia ninguna tabla', async () => {
    const primera = await sembrar(prisma);
    const asignaturasEsperadas = CARRERAS_EJEMPLO.reduce((n, c) => n + c.asignaturas.length + c.modulos.length, 0);
    expect(primera).toMatchObject({ sectores: 4, carreras: 10, asignaturas: asignaturasEsperadas, canales: 6 });

    const despuesDeLaPrimera = await conMigrador(contar);
    const segunda = await sembrar(prisma);
    const despuesDeLaSegunda = await conMigrador(contar);

    expect(segunda.usuariosNuevos).toBe(0);
    expect(despuesDeLaSegunda).toEqual(despuesDeLaPrimera);
  });

  it('deja los tres usuarios del prototipo con su rol y su alcance', async () => {
    await sembrar(prisma);
    await conMigrador(async (c) => {
      const { rows } = await c.query<{ correo: string; rol: string; sectores: string[]; carreras: string[] }>(`
        SELECT u.correo, u.rol::text,
          COALESCE((SELECT array_agg(s.nombre ORDER BY s.nombre) FROM usuario_sector us JOIN sector s ON s.id = us.sector_id WHERE us.usuario_id = u.id), '{}') AS sectores,
          COALESCE((SELECT array_agg(ca.nombre ORDER BY ca.nombre) FROM usuario_carrera uc JOIN carrera ca ON ca.id = uc.carrera_id WHERE uc.usuario_id = u.id), '{}') AS carreras
        FROM usuario u WHERE u.correo = ANY($1) ORDER BY u.correo`, [USUARIOS_EJEMPLO.map((u) => u.correo)]);
      const esperado = [...USUARIOS_EJEMPLO]
        .sort((a, b) => a.correo.localeCompare(b.correo))
        .map((u) => ({ correo: u.correo, rol: u.rol, sectores: [...u.sectores].sort(), carreras: [...u.carreras].sort() }));
      expect(rows).toEqual(esperado);
    });
  });

  it('guarda la clave de ejemplo con argon2id y no pisa la contraseña de un usuario existente', async () => {
    const correo = USUARIOS_EJEMPLO[0]?.correo ?? '';
    const contrasenas = new ContrasenasService();
    const nueva = await contrasenas.hashear('Otra-clave-2026');
    await conMigrador((c) => c.query('UPDATE usuario SET hash_contrasena = $1 WHERE correo = $2', [nueva, correo]));

    await sembrar(prisma);

    const hash = await conMigrador(async (c) => (await c.query<{ hash_contrasena: string }>('SELECT hash_contrasena FROM usuario WHERE correo = $1', [correo])).rows[0]?.hash_contrasena ?? '');
    expect(hash).toBe(nueva);
    expect(await contrasenas.verificar(hash, 'Otra-clave-2026')).toBe(true);

    const otro = USUARIOS_EJEMPLO[1]?.correo ?? '';
    const hashOtro = await conMigrador(async (c) => (await c.query<{ hash_contrasena: string }>('SELECT hash_contrasena FROM usuario WHERE correo = $1', [otro])).rows[0]?.hash_contrasena ?? '');
    expect(hashOtro).toMatch(/^\$argon2id\$/);
    expect(await contrasenas.verificar(hashOtro, CLAVE_EJEMPLO)).toBe(true);
  });
});
