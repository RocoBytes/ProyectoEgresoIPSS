import { PrismaPg } from '@prisma/adapter-pg';
import { describirError, ErrorDeUso } from '../src/cli/errores-cli';
import { principal as principalCatalogos } from '../src/cli/catalogos';
import { principal as principalUsuarios } from '../src/cli/usuarios';
import { generarPlantilla } from '../src/cli/cargar-catalogos';
import { PrismaClient } from '../src/generated/prisma/client';
import { URL_API } from './ayudas/acceso';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Los fallos son reales (base de pruebas y puertos cerrados), no objetos armados a mano: así se comprueba la forma
// con la que el adaptador pg los entrega, que es lo que `describirError` lee (ADR 0006).
describe('mensajes de error de los comandos', () => {
  let prisma: PrismaClient;
  let avisos: string[];
  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_API }) });
  });
  beforeEach(() => {
    avisos = [];
    jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void avisos.push(a.map(String).join(' ')));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const fallo = async (accion: () => Promise<unknown>): Promise<unknown> => {
    try {
      await accion();
    } catch (error) {
      return error;
    }
    throw new Error('La operación no falló');
  };

  it('un permiso denegado (42501) se explica y no filtra la consulta', async () => {
    const mensaje = describirError(await fallo(() => prisma.$executeRaw`DELETE FROM sector WHERE false`));
    expect(mensaje).toContain('negó el permiso');
    expect(mensaje).not.toMatch(/DELETE|prisma|sector/i);
    expect(describirError(await fallo(() => prisma.sector.deleteMany({ where: { nombre: 'x' } })))).toContain('negó el permiso');
  });

  it('una violación de unicidad se explica como una carrera entre operaciones', async () => {
    const nombre = `Sector único ${String(Date.now())}`;
    await prisma.sector.create({ data: { nombre } });
    const mensaje = describirError(await fallo(() => prisma.sector.create({ data: { nombre } })));
    expect(mensaje).toContain('al mismo tiempo');
    expect(mensaje).not.toContain(nombre);
  });

  it('distingue el servidor inalcanzable, la clave rechazada y la base inexistente', async () => {
    const con = async (url: string) => {
      const otro = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
      try {
        return describirError(await fallo(() => otro.sector.findMany()));
      } finally {
        await otro.$disconnect().catch(() => undefined);
      }
    };
    expect(await con('postgresql://ipss_api:x@127.0.0.1:1/ipss')).toContain('No se pudo conectar');
    expect(await con('postgresql://ipss_api:mala@127.0.0.1:55433/ipss')).toContain('rechazó el usuario o la contraseña');
    expect(await con('postgresql://ipss_api:api_dev@127.0.0.1:55433/no_existe')).toContain('no existe');
  });

  it('los errores propios, los de archivo y los desconocidos tienen su mensaje', () => {
    expect(describirError(new ErrorDeUso('Mensaje para el operador'))).toBe('Mensaje para el operador');
    expect(describirError(Object.assign(new Error('x'), { code: 'EEXIST' }))).toContain('ya existe');
    expect(describirError(Object.assign(new Error('x'), { code: 'ENOENT' }))).toContain('No se encontró');
    expect(describirError(Object.assign(new Error('x'), { code: 'EROFS' }))).toContain('solo lectura');
    expect(describirError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toContain('No se pudo conectar');
    expect(describirError(new AggregateError([Object.assign(new Error('x'), { code: 'ECONNREFUSED' })]))).toContain('No se pudo conectar');
    const inesperado = describirError(new Error('detalle interno con datos de la fila'));
    expect(inesperado).toContain('error inesperado');
    expect(inesperado).not.toContain('detalle interno');
  });

  it('usuarios y catálogos muestran el mensaje de la causa y salen con 1', async () => {
    expect(await principalUsuarios(['listar'], { url: 'postgresql://ipss_api:x@127.0.0.1:1/ipss' })).toBe(1);
    expect(await principalUsuarios(['listar'], { url: 'postgresql://ipss_api:mala@127.0.0.1:55433/ipss' })).toBe(1);
    const dir = await mkdtemp(join(tmpdir(), 'ipss-errores-'));
    try {
      const ruta = join(dir, 'p.xlsx');
      await writeFile(ruta, await generarPlantilla());
      expect(await principalCatalogos([ruta], { url: 'postgresql://ipss_api:x@127.0.0.1:1/ipss' })).toBe(1);
      expect(await principalCatalogos([join(dir, 'no-existe.xlsx')], { url: URL_API })).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    const texto = avisos.join('\n');
    expect(texto).toContain('No se pudo conectar');
    expect(texto).toContain('rechazó el usuario o la contraseña');
    expect(texto).toContain('No se encontró el archivo');
    expect(texto).not.toMatch(/127\.0\.0\.1|mala/);
  });

  it('un fallo al cerrar la conexión no escapa ni cambia el resultado', async () => {
    const cerrar = jest.spyOn(PrismaClient.prototype, '$disconnect').mockRejectedValue(new Error('no se pudo cerrar'));
    try {
      expect(await principalUsuarios(['listar'], { url: URL_API, salida: () => undefined })).toBe(0);
      expect(cerrar).toHaveBeenCalled();
    } finally {
      cerrar.mockRestore();
    }
  });
});
