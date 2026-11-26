import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { URL_API } from './ayudas/acceso';

// Los dos CHECK de la migración 20261126180000_acceso, ejercitados como la API (ipss_api):
// es el rol que los toparía en producción.
describe('reglas de base de datos de acceso (CHECK de usuario)', () => {
  let api: Client;

  beforeAll(async () => {
    api = new Client({ connectionString: URL_API });
    await api.connect();
  });
  afterAll(async () => {
    await api.end();
  });

  const insertar = (correo: string, hash: string): Promise<unknown> =>
    api.query(`INSERT INTO usuario (correo, nombre, hash_contrasena, rol) VALUES ($1, 'Prueba', $2, 'DIRECTOR_CARRERA')`, [correo, hash]);
  const correoValido = (): string => `${randomUUID()}@ejemplo.cl`;
  const hashValido = '$argon2id$v=19$m=65536,t=3,p=4$c2Fs$aGFzaA';

  const violacion = async (accion: Promise<unknown>): Promise<{ code?: string; constraint?: string }> => {
    try {
      await accion;
    } catch (error) {
      return error as { code?: string; constraint?: string };
    }
    throw new Error('La inserción debía fallar y se aceptó');
  };

  it('acepta un correo en minúsculas y un hash argon2id', async () => {
    await expect(insertar(correoValido(), hashValido)).resolves.toBeDefined();
  });

  it.each([
    ['con mayúsculas', (c: string) => c.replace('@', 'X@').toUpperCase()],
    ['con espacios al inicio', (c: string) => ` ${c}`],
    ['con espacios al final', (c: string) => `${c} `],
  ])('rechaza un correo %s con usuario_correo_normalizado', async (_nombre, transformar) => {
    const error = await violacion(insertar(transformar(correoValido()), hashValido));
    expect(error).toMatchObject({ code: '23514', constraint: 'usuario_correo_normalizado' });
  });

  it.each([
    ['texto plano', 'Demo-2026'],
    ['bcrypt', '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345'],
    ['argon2i', '$argon2i$v=19$m=65536,t=3,p=4$c2Fs$aGFzaA'],
    ['argon2id sin el signo $ inicial', 'argon2id$v=19$m=65536,t=3,p=4$c2Fs$aGFzaA'],
    ['vacío', ''],
  ])('rechaza un hash %s con usuario_hash_argon2id', async (_nombre, hash) => {
    const error = await violacion(insertar(correoValido(), hash));
    expect(error).toMatchObject({ code: '23514', constraint: 'usuario_hash_argon2id' });
  });

  it('también rechaza dejar a un usuario existente con un hash o un correo no válido (UPDATE)', async () => {
    const correo = correoValido();
    await insertar(correo, hashValido);
    expect(await violacion(api.query(`UPDATE usuario SET hash_contrasena = 'plano' WHERE correo = $1`, [correo]))).toMatchObject({ constraint: 'usuario_hash_argon2id' });
    expect(await violacion(api.query(`UPDATE usuario SET correo = upper(correo) WHERE correo = $1`, [correo]))).toMatchObject({ constraint: 'usuario_correo_normalizado' });
  });
});
