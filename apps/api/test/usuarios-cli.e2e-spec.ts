import { randomUUID } from 'node:crypto';
import { type AppDePruebas, conMigrador, crearCarrera, crearSector, levantarApp, pedir, sesionDe, cookiesDe, URL_API } from './ayudas/acceso';
import { formatearListado, principal } from '../src/cli/usuarios';

describe('administración de usuarios por línea de comandos (e2e contra PostgreSQL real)', () => {
  let ap: AppDePruebas;
  let s: string;
  let sectorA: string;
  let nombreSector: string;
  let nombreCarrera: string;
  let salida: string[];
  let avisos: string[];

  const correo = (n: string): string => `${n}-${s}@ejemplo.cl`;
  const ejecutar = (...args: string[]) => principal(args, { url: URL_API, salida: (l) => salida.push(l), error: (l) => avisos.push(l) });
  const claveDe = (): string => {
    const linea = salida.find((l) => l.startsWith('Clave temporal de'));
    if (linea === undefined) throw new Error('No se mostró la clave temporal');
    return linea.slice(linea.indexOf(': ') + 2);
  };
  const ingresar = (c: string, contrasena: string) => pedir<{ message?: string }>(ap.url, 'POST', '/api/acceso/ingresar', { cuerpo: { correo: c, contrasena } });
  const fila = async (c: string) => (await conMigrador((cl) => cl.query<{ activo: boolean; intentos_fallidos: number; bloqueado_hasta: Date | null; hash_contrasena: string }>('SELECT activo, intentos_fallidos, bloqueado_hasta, hash_contrasena FROM usuario WHERE correo = $1', [c]))).rows[0];

  beforeAll(async () => {
    ap = await levantarApp();
  });
  beforeEach(async () => {
    s = randomUUID().slice(0, 8);
    salida = [];
    avisos = [];
    nombreSector = `Sector usuarios ${s}`;
    nombreCarrera = `Carrera usuarios ${s}`;
    sectorA = await crearSector(nombreSector);
    await crearCarrera(sectorA, nombreCarrera);
  });
  afterAll(() => ap.app.close());

  it('una cuenta creada entra por la API con la clave temporal y queda con su alcance', async () => {
    expect(await ejecutar('crear', '--correo', `  ${correo('Ana').toUpperCase()} `, '--nombre', 'Ana Prueba', '--rol', 'DIRECTOR_SECTORIAL', '--sector', nombreSector.toUpperCase())).toBe(0);
    const clave = claveDe();
    expect(clave.length).toBeGreaterThanOrEqual(16);
    const r = await ingresar(correo('ana'), clave);
    expect(r.estado).toBe(200);
    const yo = await pedir<{ rol: string }>(ap.url, 'GET', '/api/acceso/yo', { cookies: cookiesDe(sesionDe(r)) });
    expect(yo.cuerpo).toMatchObject({ rol: 'DIRECTOR_SECTORIAL' });
    const enBd = await conMigrador((c) => c.query('SELECT 1 FROM usuario_sector us JOIN usuario u ON u.id = us.usuario_id WHERE u.correo = $1 AND us.sector_id = $2', [correo('ana'), sectorA]));
    expect(enBd.rowCount).toBe(1);
    // La clave aparece una sola vez y solo por la salida normal.
    expect(salida.filter((l) => l.includes(clave))).toHaveLength(1);
    expect(avisos.join('\n')).not.toContain(clave);
    expect(avisos.join('\n')).toContain('canal seguro');
  });

  it('crea directores de carrera y de calidad, y cada una con su regla de alcance', async () => {
    expect(await ejecutar('crear', '--correo', correo('car'), '--nombre', 'Carla', '--rol', 'DIRECTOR_CARRERA', '--carrera', nombreCarrera)).toBe(0);
    expect(await ejecutar('crear', '--correo', correo('cal'), '--nombre', 'Paula', '--rol', 'ASEGURAMIENTO_CALIDAD')).toBe(0);
    for (const args of [
      ['--rol', 'DIRECTOR_SECTORIAL'],
      ['--rol', 'DIRECTOR_SECTORIAL', '--sector', nombreSector, '--carrera', nombreCarrera],
      ['--rol', 'DIRECTOR_CARRERA'],
      ['--rol', 'DIRECTOR_CARRERA', '--sector', nombreSector],
      ['--rol', 'ASEGURAMIENTO_CALIDAD', '--sector', nombreSector],
      ['--rol', 'DIRECTOR_CARRERA', '--carrera', 'Carrera que no existe'],
      ['--rol', 'JEFE'],
    ]) {
      avisos = [];
      expect(await ejecutar('crear', '--correo', correo('x'), '--nombre', 'X', ...args)).toBe(1);
      expect(avisos).toHaveLength(1);
    }
    expect(await fila(correo('x'))).toBeUndefined();
  });

  it('rechaza un correo repetido, aunque cambien las mayúsculas, y un correo mal escrito', async () => {
    expect(await ejecutar('crear', '--correo', correo('dup'), '--nombre', 'Uno', '--rol', 'ASEGURAMIENTO_CALIDAD')).toBe(0);
    avisos = [];
    expect(await ejecutar('crear', '--correo', correo('DUP'), '--nombre', 'Dos', '--rol', 'ASEGURAMIENTO_CALIDAD')).toBe(1);
    expect(avisos[0]).toContain('Ya existe una cuenta');
    expect(await ejecutar('crear', '--correo', 'sin-arroba', '--nombre', 'Tres', '--rol', 'ASEGURAMIENTO_CALIDAD')).toBe(1);
  });

  it('una cuenta desactivada no entra y sus sesiones quedan revocadas; al activarla vuelve a entrar', async () => {
    await ejecutar('crear', '--correo', correo('baja'), '--nombre', 'Baja', '--rol', 'ASEGURAMIENTO_CALIDAD');
    const clave = claveDe();
    const viva = await ingresar(correo('baja'), clave);
    const cookies = cookiesDe(sesionDe(viva));
    expect((await pedir(ap.url, 'GET', '/api/acceso/yo', { cookies })).estado).toBe(200);
    salida = [];
    expect(await ejecutar('desactivar', '--correo', correo('baja'))).toBe(0);
    expect(salida[0]).toContain('Sesiones cerradas: 1');
    expect((await pedir(ap.url, 'GET', '/api/acceso/yo', { cookies })).estado).toBe(401);
    expect((await pedir(ap.url, 'POST', '/api/acceso/renovar', { cookies })).estado).toBe(401);
    expect((await ingresar(correo('baja'), clave)).estado).toBe(401);
    const sinRevocar = await conMigrador((c) => c.query('SELECT 1 FROM refresh_token r JOIN usuario u ON u.id = r.usuario_id WHERE u.correo = $1 AND r.revocado_en IS NULL', [correo('baja')]));
    expect(sinRevocar.rowCount).toBe(0);
    expect(await ejecutar('activar', '--correo', correo('baja'))).toBe(0);
    expect((await ingresar(correo('baja'), clave)).estado).toBe(200);
  });

  it('restablecer la clave invalida la anterior, limpia el bloqueo y cierra las sesiones', async () => {
    await ejecutar('crear', '--correo', correo('reset'), '--nombre', 'Reset', '--rol', 'ASEGURAMIENTO_CALIDAD');
    const vieja = claveDe();
    const cookies = cookiesDe(sesionDe(await ingresar(correo('reset'), vieja)));
    for (let i = 0; i < 5; i += 1) await ingresar(correo('reset'), 'clave-incorrecta');
    expect((await fila(correo('reset')))?.bloqueado_hasta).not.toBeNull();
    salida = [];
    expect(await ejecutar('restablecer-clave', '--correo', correo('reset'))).toBe(0);
    const nueva = claveDe();
    expect(nueva).not.toBe(vieja);
    expect(await fila(correo('reset'))).toMatchObject({ intentos_fallidos: 0, bloqueado_hasta: null });
    expect((await pedir(ap.url, 'GET', '/api/acceso/yo', { cookies })).estado).toBe(401);
    expect((await ingresar(correo('reset'), vieja)).estado).toBe(401);
    expect((await ingresar(correo('reset'), nueva)).estado).toBe(200);
  });

  it('listar muestra correo, nombre, rol, estado y alcance, y nunca un hash', async () => {
    await ejecutar('crear', '--correo', correo('lista'), '--nombre', 'Lista', '--rol', 'DIRECTOR_CARRERA', '--carrera', nombreCarrera);
    const hash = (await fila(correo('lista')))?.hash_contrasena ?? '';
    expect(hash).toMatch(/^\$argon2id\$/);
    salida = [];
    expect(await ejecutar('listar')).toBe(0);
    const texto = salida.join('\n');
    expect(texto).toContain(correo('lista'));
    expect(texto).toContain('DIRECTOR_CARRERA');
    expect(texto).toContain(nombreCarrera);
    expect(texto).not.toMatch(/argon2/i);
    expect(texto).not.toContain(hash);
    expect(formatearListado([])).toEqual(['No hay cuentas.']);
  });

  it('un correo inexistente es un error de datos (1) y los argumentos incorrectos devuelven 2', async () => {
    expect(await ejecutar('desactivar', '--correo', correo('nadie'))).toBe(1);
    expect(await ejecutar('activar', '--correo', correo('nadie'))).toBe(1);
    expect(await ejecutar('restablecer-clave', '--correo', correo('nadie'))).toBe(1);
    for (const args of [[], ['otro'], ['crear'], ['crear', '--correo', 'a@b.cl'], ['desactivar'], ['desactivar', '--nombre', 'x'], ['listar', '--correo', 'a@b.cl'], ['crear', '--correo']]) {
      expect(await ejecutar(...args)).toBe(2);
    }
  });
});
