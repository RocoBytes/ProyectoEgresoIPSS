import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defer, lastValueFrom, of } from 'rxjs';
import { conLimpieza, excedeTamanoEnvio, MAXIMO_BYTES_ENVIO, type PeticionConArchivos } from './subida-evidencias.interceptor';

describe('excedeTamanoEnvio', () => {
  it('permite exactamente 100 MB decimales y rechaza un byte más', () => {
    expect(MAXIMO_BYTES_ENVIO).toBe(100_000_000);
    expect(excedeTamanoEnvio('100000000')).toBe(false);
    expect(excedeTamanoEnvio('100000001')).toBe(true);
  });

  it('deja pasar lo que no se puede medir: sin cabecera o no numérica', () => {
    expect(excedeTamanoEnvio(undefined)).toBe(false);
    expect(excedeTamanoEnvio('')).toBe(false);
    expect(excedeTamanoEnvio('abc')).toBe(false);
    expect(excedeTamanoEnvio('-5')).toBe(false);
  });
});

describe('conLimpieza', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ipss-limpieza-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const crear = async (...nombres: string[]): Promise<string[]> => {
    const rutas = nombres.map((n) => join(dir, n));
    await Promise.all(rutas.map((r) => writeFile(r, 'x')));
    return rutas;
  };
  const ruta = (nombre: string): string => join(dir, nombre);
  const existe = async (ruta: string): Promise<boolean> => access(ruta).then(() => true, () => false);
  const peticion = (extra: Partial<PeticionConArchivos>): PeticionConArchivos => ({ headers: {}, ...extra });

  it('si el caso de uso falla, borra file y files antes de entregar el error', async () => {
    await crear('a', 'b', 'c');
    const [uno, dos, tres] = [ruta('a'), ruta('b'), ruta('c')] as const;
    const req = peticion({ file: { path: uno }, files: { acta: [{ path: dos }], fotos: [{ path: tres }] } });
    const falla = defer(() => new Promise<never>((_resolver, rechazar) => setTimeout(() => rechazar(new Error('falló el caso de uso')), 5)));
    await expect(lastValueFrom(conLimpieza(req, falla))).rejects.toThrow('falló el caso de uso');
    // El error se entregó solo después de la limpieza: al llegar aquí ya no hay nada.
    expect(await Promise.all([uno, dos, tres].map((r) => existe(r)))).toEqual([false, false, false]);
  });

  it('si el caso de uso tiene éxito, los archivos ya no existen cuando llega el resultado', async () => {
    await crear('a', 'b');
    const [uno, dos] = [ruta('a'), ruta('b')] as const;
    const req = peticion({ files: [{ path: uno }, { path: dos }] });
    const exito = defer(() => Promise.resolve('listo'));
    const alLlegar = await new Promise<{ valor: string; existen: boolean[] }>((resolver, rechazar) => {
      conLimpieza(req, exito).subscribe({
        next: (valor) => void Promise.all([uno, dos].map((r) => existe(r))).then((existen) => resolver({ valor, existen })),
        error: rechazar,
      });
    });
    expect(alLlegar.valor).toBe('listo');
    expect(alLlegar.existen).toEqual([false, false]);
  });

  it('ignora lo que ya no existe y un borrado que falla no cambia el resultado', async () => {
    await crear('a');
    const uno = ruta('a');
    // Una ruta que es un directorio con contenido no se puede borrar con rm sin `recursive`: el fallo se traga.
    await mkdir(join(dir, 'carpeta'));
    await writeFile(join(dir, 'carpeta', 'x'), 'x');
    const req = peticion({ files: [{ path: uno }, { path: join(dir, 'no-existe') }, { path: join(dir, 'carpeta') }, {}] });
    await expect(lastValueFrom(conLimpieza(req, of(42)))).resolves.toBe(42);
    expect(await existe(uno)).toBe(false);
  });
});
