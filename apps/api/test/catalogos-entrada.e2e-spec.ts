import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { Workbook } from 'exceljs';
import { MAXIMO_BYTES_PLANILLA, MAXIMO_FILAS_POR_HOJA, generarPlantilla, leerPlanilla } from '../src/cli/cargar-catalogos';
import { principal } from '../src/cli/catalogos';
import { URL_API, conMigrador } from './ayudas/acceso';

const entrada = (...trozos: Buffer[]): AsyncIterable<Uint8Array> => Readable.from(trozos);

describe('catalogos: guardas de entrada y códigos de salida', () => {
  let dir: string;
  let errores: string[];
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ipss-catalogos-'));
    errores = [];
    jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errores.push(a.map(String).join(' ')));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });
  const mensajes = (): string => errores.join('\n');
  const contarSectores = async (): Promise<number> => Number((await conMigrador((c) => c.query<{ n: string }>('SELECT count(*) AS n FROM sector'))).rows[0]?.n);

  it('rechaza un archivo de más de 5 MB sin leerlo', async () => {
    const ruta = join(dir, 'grande.xlsx');
    await writeFile(ruta, Buffer.alloc(MAXIMO_BYTES_PLANILLA + 1));
    expect(await principal([ruta], { url: URL_API })).toBe(1);
    expect(mensajes()).toContain('pesa más de 5 MB');
  });

  it('rechaza más de 5 MB por la entrada estándar', async () => {
    const trozo = Buffer.alloc(1024 * 1024, 1);
    const codigo = await principal(['-'], { url: URL_API, stdin: entrada(trozo, trozo, trozo, trozo, trozo, trozo) });
    expect(codigo).toBe(1);
    expect(mensajes()).toContain('pesa más de 5 MB');
  });

  it('exige la extensión .xlsx', async () => {
    const ruta = join(dir, 'planilla.txt');
    await writeFile(ruta, await generarPlantilla());
    expect(await principal([ruta], { url: URL_API })).toBe(1);
    expect(mensajes()).toContain('.xlsx');
  });

  it('rechaza un contenido sin firma zip, por archivo y por entrada estándar', async () => {
    const ruta = join(dir, 'falso.xlsx');
    await writeFile(ruta, 'esto no es una planilla');
    expect(await principal([ruta], { url: URL_API })).toBe(1);
    expect(mensajes()).toContain('no es una planilla');
    errores.length = 0;
    expect(await principal(['-'], { url: URL_API, stdin: entrada(Buffer.from('tampoco')) })).toBe(1);
    expect(mensajes()).toContain('no es una planilla');
  });

  it('devuelve 2 con argumentos incorrectos y no toca la base', async () => {
    for (const args of [[], ['--plantilla'], ['a.xlsx', 'b.xlsx'], ['--otra-cosa'], ['--plantilla', 'a', 'b']]) {
      expect(await principal(args, { url: URL_API })).toBe(2);
    }
    expect(mensajes()).toContain('Uso:');
  });

  it('devuelve 1 con errores de validación y no escribe nada', async () => {
    const libro = new Workbook();
    libro.addWorksheet('Sectores').addRow(['Nombre']);
    libro.addWorksheet('Carreras').addRow(['Sector', 'Nombre']).worksheet.addRow(['Sector que no existe', 'Carrera huérfana']);
    libro.addWorksheet('Asignaturas').addRow(['Carrera', 'Tipo', 'Nombre', 'Código']);
    libro.addWorksheet('Canales').addRow(['Nombre', 'Activo']);
    const ruta = join(dir, 'invalida.xlsx');
    await writeFile(ruta, Buffer.from(await libro.xlsx.writeBuffer()));
    const antes = await contarSectores();
    expect(await principal([ruta], { url: URL_API })).toBe(1);
    expect(mensajes()).toContain('Carreras, fila 2');
    expect(await contarSectores()).toBe(antes);
  });

  it('--plantilla escribe el archivo, no pisa uno existente y puede escribir por la salida estándar', async () => {
    const ruta = join(dir, 'plantilla.xlsx');
    expect(await principal(['--plantilla', ruta])).toBe(0);
    const primera = await readFile(ruta);
    expect((await leerPlanilla(primera)).errores).toEqual([]);
    expect(await principal(['--plantilla', ruta])).toBe(1);
    expect(mensajes()).toContain('ya existe: no se sobrescribe');
    expect((await readFile(ruta)).equals(primera)).toBe(true);
    const escrito: Uint8Array[] = [];
    expect(await principal(['--plantilla', '-'], { stdout: { write: (c) => escrito.push(c) } })).toBe(0);
    expect(Buffer.from(escrito[0] ?? new Uint8Array()).subarray(0, 2).toString()).toBe('PK');
  });

  it('--plantilla no toma otra bandera como nombre de archivo', async () => {
    expect(await principal(['--plantilla', '--prueba'])).toBe(2);
    expect(await principal(['--prueba', '--plantilla', join(dir, 'x.xlsx')])).toBe(2);
  });

  it('acepta exactamente 20.000 filas de datos (20.001 con el encabezado)', async () => {
    const libro = new Workbook();
    const hoja = libro.addWorksheet('Sectores');
    hoja.addRow(['Nombre']);
    for (let i = 0; i < MAXIMO_FILAS_POR_HOJA; i += 1) hoja.addRow([`S${String(i)}`]);
    libro.addWorksheet('Carreras').addRow(['Sector', 'Nombre']);
    libro.addWorksheet('Asignaturas').addRow(['Carrera', 'Tipo', 'Nombre']);
    libro.addWorksheet('Canales').addRow(['Nombre', 'Activo']);
    const { planilla, errores: e } = await leerPlanilla(Buffer.from(await libro.xlsx.writeBuffer()));
    expect(e).toEqual([]);
    expect(planilla.sectores).toHaveLength(MAXIMO_FILAS_POR_HOJA);
  });

  it('rechaza una hoja con más de 20.000 filas de datos', async () => {
    const libro = new Workbook();
    const hoja = libro.addWorksheet('Sectores');
    hoja.addRow(['Nombre']);
    for (let i = 0; i <= MAXIMO_FILAS_POR_HOJA; i += 1) hoja.addRow([`S${String(i)}`]);
    libro.addWorksheet('Carreras').addRow(['Sector', 'Nombre']);
    libro.addWorksheet('Asignaturas').addRow(['Carrera', 'Tipo', 'Nombre']);
    libro.addWorksheet('Canales').addRow(['Nombre', 'Activo']);
    const { errores: e } = await leerPlanilla(Buffer.from(await libro.xlsx.writeBuffer()));
    expect(e).toEqual([{ hoja: 'Sectores', fila: 0, mensaje: 'La hoja tiene más de 20000 filas.' }]);
  });
});
