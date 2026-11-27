import { readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { describirError, ErrorDeUso } from './errores-cli';
import { cargarCatalogos, generarPlantilla, MAXIMO_BYTES_PLANILLA, type ResultadoCarga } from './cargar-catalogos';

const USO = `Uso:
  catalogos <archivo.xlsx | -> [--prueba]   carga la planilla (- lee de la entrada estándar)
  catalogos --plantilla <salida.xlsx | ->   escribe una planilla de ejemplo`;

// Los .xlsx son archivos zip: empiezan por «PK».
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Con `npm run`, el directorio de trabajo es el del paquete; INIT_CWD conserva desde donde escribió el usuario. */
const rutaDe = (ruta: string): string => (isAbsolute(ruta) ? ruta : resolve(process.env['INIT_CWD'] ?? process.cwd(), ruta));

async function leerEntrada(origen: string, stdin: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const demasiado = `La planilla pesa más de ${String(MAXIMO_BYTES_PLANILLA / 1024 / 1024)} MB.`;
  let contenido: Buffer;
  if (origen === '-') {
    const trozos: Buffer[] = [];
    let total = 0;
    for await (const trozo of stdin) {
      const b = Buffer.from(trozo);
      total += b.length;
      if (total > MAXIMO_BYTES_PLANILLA) throw new ErrorDeUso(demasiado);
      trozos.push(b);
    }
    contenido = Buffer.concat(trozos);
  } else {
    const ruta = rutaDe(origen);
    if (!ruta.toLowerCase().endsWith('.xlsx')) throw new ErrorDeUso('El archivo debe ser una planilla .xlsx.');
    if ((await stat(ruta)).size > MAXIMO_BYTES_PLANILLA) throw new ErrorDeUso(demasiado);
    contenido = await readFile(ruta);
  }
  if (!contenido.subarray(0, 4).equals(FIRMA_ZIP)) throw new ErrorDeUso('El contenido no es una planilla .xlsx.');
  return contenido;
}

const LIMITE_LISTA = 20;

export function formatearResultado(r: ResultadoCarga, prueba: boolean): string[] {
  if (r.errores.length > 0) {
    return [
      `La planilla tiene ${String(r.errores.length)} error(es). No se escribió nada.`,
      ...r.errores.map((e) => `  ${e.hoja}${e.fila > 0 ? `, fila ${String(e.fila)}` : ''}: ${e.mensaje}`),
    ];
  }
  const linea = (hoja: string, c: { nuevos: number; actualizados: number; sinCambios: number }): string => `  ${hoja}: ${String(c.nuevos)} nuevos, ${String(c.actualizados)} actualizados, ${String(c.sinCambios)} sin cambios`;
  const lineas = [
    prueba ? 'Modo de prueba: la planilla es válida y no se escribió nada. Esto es lo que cambiaría:' : 'Catálogos cargados:',
    linea('Sectores', r.resumen.sectores),
    linea('Carreras', r.resumen.carreras),
    linea('Asignaturas y módulos', r.resumen.asignaturas),
    linea('Canales', r.resumen.canales),
  ];
  if (r.noIncluidos.length > 0) {
    lineas.push(`No incluidos en la planilla (se dejan como están): ${String(r.noIncluidos.length)}`);
    for (const x of r.noIncluidos.slice(0, LIMITE_LISTA)) lineas.push(`  ${x.hoja}: ${x.nombre}`);
    if (r.noIncluidos.length > LIMITE_LISTA) lineas.push(`  … y ${String(r.noIncluidos.length - LIMITE_LISTA)} más`);
  }
  return lineas;
}

export interface Dependencias {
  /** Entrada estándar (por defecto la del proceso). */
  stdin?: AsyncIterable<Uint8Array>;
  stdout?: { write(contenido: Uint8Array): unknown };
  /** Conexión a la base (por defecto DATABASE_URL). */
  url?: string;
}

/** Devuelve el código de salida: 0 bien, 1 error de la planilla o de la ejecución, 2 argumentos incorrectos. */
export async function principal(args: string[], dependencias: Dependencias = {}): Promise<number> {
  try {
    return await ejecutar(args, dependencias);
  } catch (error) {
    console.error(`La carga de catálogos falló: ${describirError(error)}`);
    return 1;
  }
}

async function ejecutar(args: string[], dependencias: Dependencias): Promise<number> {
  if (args[0] === '--plantilla') {
    const salida = args[1];
    // `-` es la salida estándar; cualquier otro valor con `--` es otra bandera y no un nombre de archivo.
    if (salida === undefined || args.length > 2 || salida.startsWith('--')) {
      console.error(USO);
      return 2;
    }
    const contenido = await generarPlantilla();
    if (salida === '-') (dependencias.stdout ?? process.stdout).write(contenido);
    else {
      const ruta = rutaDe(salida);
      // `wx`: no pisa una planilla que el operador ya haya llenado.
      await writeFile(ruta, contenido, { flag: 'wx' });
      console.error(`Plantilla escrita en ${ruta}.`);
    }
    return 0;
  }
  const prueba = args.includes('--prueba');
  const posicionales = args.filter((a) => a !== '--prueba');
  const origen = posicionales[0];
  if (origen === undefined || posicionales.length > 1 || (origen.startsWith('--') && origen !== '-')) {
    console.error(USO);
    return 2;
  }
  const url = dependencias.url ?? process.env['DATABASE_URL'];
  if (url === undefined || url.trim() === '') {
    console.error('Falta la variable de entorno DATABASE_URL (conexión a la base con el rol ipss_api).');
    return 1;
  }
  const contenido = await leerEntrada(origen, dependencias.stdin ?? process.stdin);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const resultado = await cargarCatalogos(prisma, contenido, { prueba });
    const lineas = formatearResultado(resultado, prueba);
    (resultado.errores.length > 0 ? console.error : console.log)(lineas.join('\n'));
    return resultado.errores.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

// Solo corre al ejecutar el archivo, no al importarlo desde una prueba. Permitido con NODE_ENV=production: es la vía de TI.
if (require.main === module) {
  principal(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    () => process.exit(1),
  );
}
