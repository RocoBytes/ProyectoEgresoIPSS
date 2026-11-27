import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Configuracion } from '../configuracion';
import { DiscoLocal } from './disco-local';
import { nombreSeguro } from './validador-archivos';

describe('DiscoLocal', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ipss-disco-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const crear = (ahora: Date) => new DiscoLocal({ directorioEvidencias: dir } as Configuracion, { ahora: () => ahora });
  const existe = (ruta: string) => stat(ruta).then(() => true, () => false);

  it('al arrancar borra de .entrantes lo de más de una hora y deja lo reciente', async () => {
    const disco = crear(new Date());
    await disco.onModuleInit();
    const viejo = join(dir, '.entrantes', randomUUID());
    const reciente = join(dir, '.entrantes', randomUUID());
    await writeFile(viejo, 'x');
    await writeFile(reciente, 'y');
    const hace2h = new Date(Date.now() - 2 * 3_600_000);
    await utimes(viejo, hace2h, hace2h);
    await disco.onModuleInit();
    expect(await existe(viejo)).toBe(false);
    expect(await existe(reciente)).toBe(true);
  });

  it('el reloj decide qué es «viejo»', async () => {
    const disco = crear(new Date(Date.now() + 3 * 3_600_000));
    await disco.onModuleInit();
    const archivo = join(dir, '.entrantes', randomUUID());
    await writeFile(archivo, 'x');
    await disco.onModuleInit();
    expect(await existe(archivo)).toBe(false);
  });

  it('incorpora con permisos 0640 y se puede abrir por manejador', async () => {
    const disco = crear(new Date());
    await disco.onModuleInit();
    const temporal = join(dir, '.entrantes', randomUUID());
    await writeFile(temporal, 'contenido');
    const ruta = await disco.incorporar(temporal);
    expect((await stat(join(dir, ruta))).mode & 0o777).toBe(0o640);
    const manejador = await disco.abrir(ruta);
    expect((await manejador.readFile()).toString()).toBe('contenido');
    await manejador.close();
    expect((await readFile(join(dir, ruta))).length).toBe(9);
  });
});

describe('nombreSeguro', () => {
  it('quita caracteres de control y espacios de los bordes', () => {
    expect(nombreSeguro('  acta\r\nX-Evil: 1.pdf\u0000 ')).toBe('actaX-Evil: 1.pdf');
  });
  it('recorta a 255 conservando la extensión', () => {
    const n = nombreSeguro(`${'a'.repeat(300)}.pdf`);
    expect(n).toHaveLength(255);
    expect(n.endsWith('.pdf')).toBe(true);
  });
});
