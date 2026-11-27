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
import { Readable } from 'node:stream';

// Los fallos son reales (base de pruebas y puertos cerrados), no objetos armados a mano: así se comprueba la forma
// con la que el adaptador pg los entrega, que es lo que `describirError` lee (ADR 0006).
/** Variante de URL_API con un puerto, una contraseña o una base distintos. */
function urlCon(cambios: { puerto?: string; contrasena?: string; base?: string }): string {
  const url = new URL(URL_API);
  if (cambios.puerto !== undefined) url.port = cambios.puerto;
  if (cambios.contrasena !== undefined) url.password = cambios.contrasena;
  if (cambios.base !== undefined) url.pathname = `/${cambios.base}`;
  return url.toString();
}

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
    // La violación real ocurre dentro de una transacción que se revierte: no queda ninguna fila en la base compartida.
    const mensaje = describirError(
      await fallo(() =>
        prisma.$transaction(async (tx) => {
          await tx.sector.create({ data: { nombre } });
          await tx.sector.create({ data: { nombre } });
        }),
      ),
    );
    expect(await prisma.sector.count({ where: { nombre } })).toBe(0);
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
    expect(await con(urlCon({ puerto: '1' }))).toContain('No se pudo conectar');
    expect(await con(urlCon({ contrasena: 'mala' }))).toContain('rechazó el usuario o la contraseña');
    expect(await con(urlCon({ base: 'no_existe' }))).toContain('no existe');
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
    expect(await principalUsuarios(['listar'], { url: urlCon({ puerto: '1' }) })).toBe(1);
    expect(await principalUsuarios(['listar'], { url: urlCon({ contrasena: 'mala' }) })).toBe(1);
    const dir = await mkdtemp(join(tmpdir(), 'ipss-errores-'));
    try {
      const ruta = join(dir, 'p.xlsx');
      await writeFile(ruta, await generarPlantilla());
      expect(await principalCatalogos([ruta], { url: urlCon({ puerto: '1' }) })).toBe(1);
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

  it('los mensajes pensados para el operador siguen llegando a él', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ipss-errores-'));
    try {
      const ruta = join(dir, 'planilla.txt');
      await writeFile(ruta, 'x');
      expect(await principalCatalogos([ruta], { url: URL_API })).toBe(1);
      expect(avisos.join('\n')).toContain('El archivo debe ser una planilla .xlsx.');
      avisos.length = 0;
      expect(await principalCatalogos(['-'], { url: URL_API, stdin: Readable.from([Buffer.from('no es zip')]) })).toBe(1);
      expect(avisos.join('\n')).toContain('El contenido no es una planilla .xlsx.');
      expect(avisos.join('\n')).not.toContain('error inesperado');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
