import { Workbook } from 'exceljs';
import type { PrismaClient } from '../generated/prisma/client';
import { ErrorDeUso } from './errores-cli';
import { CANALES_EJEMPLO, CARRERAS_EJEMPLO, SECTORES_EJEMPLO } from './datos-ejemplo';

export const MAXIMO_BYTES_PLANILLA = 5 * 1024 * 1024;
// Una planilla real tiene cientos de filas; el tope evita que un .xlsx inflado agote la memoria.
export const MAXIMO_FILAS_POR_HOJA = 20_000;

export interface ErrorPlanilla {
  hoja: string;
  /** Fila de Excel (la 1 es el encabezado); 0 si el error es de la hoja completa. */
  fila: number;
  mensaje: string;
}

type TipoAsignatura = 'ASIGNATURA' | 'MODULO';

interface FilaSector { fila: number; nombre: string }
interface FilaCarrera { fila: number; sector: string; nombre: string }
interface FilaAsignatura { fila: number; carrera: string; tipo: TipoAsignatura; nombre: string; codigo: string | null }
interface FilaCanal { fila: number; nombre: string; activo: boolean }

interface Planilla {
  sectores: FilaSector[];
  carreras: FilaCarrera[];
  asignaturas: FilaAsignatura[];
  canales: FilaCanal[];
}

export interface ConteoHoja {
  nuevos: number;
  actualizados: number;
  sinCambios: number;
}

export interface ResultadoCarga {
  errores: ErrorPlanilla[];
  /** `true` solo si se escribió en la base (sin errores y sin `prueba`). */
  aplicado: boolean;
  resumen: Record<'sectores' | 'carreras' | 'asignaturas' | 'canales', ConteoHoja>;
  /** Filas que están en la base y no en la planilla: se dejan como están. */
  noIncluidos: Array<{ hoja: string; nombre: string }>;
}

const HOJAS = { sectores: 'Sectores', carreras: 'Carreras', asignaturas: 'Asignaturas', canales: 'Canales' } as const;
const COLUMNAS = {
  sectores: ['Nombre'],
  carreras: ['Sector', 'Nombre'],
  asignaturas: ['Carrera', 'Tipo', 'Nombre', 'Código'],
  canales: ['Nombre', 'Activo'],
} as const;
const OPCIONALES = new Set(['codigo']);

/** Minúsculas, sin tildes y sin espacios sobrantes: «Código », «codigo» y «CÓDIGO» son la misma columna. */
const normalizar = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const clave = (...partes: string[]): string => partes.map(normalizar).join('|');

function textoDe(celda: { text?: string } | undefined): string {
  // `text` resuelve fórmulas y texto con formato; los números y fechas llegan como su texto visible.
  return (celda?.text ?? '').trim();
}

/** Lee y revisa la forma de la planilla (hojas, encabezados, celdas vacías, valores y duplicados). */
export async function leerPlanilla(contenido: Buffer): Promise<{ planilla: Planilla; errores: ErrorPlanilla[] }> {
  const errores: ErrorPlanilla[] = [];
  const planilla: Planilla = { sectores: [], carreras: [], asignaturas: [], canales: [] };
  const libro = new Workbook();
  try {
    await libro.xlsx.load(contenido as unknown as Parameters<typeof libro.xlsx.load>[0]);
  } catch {
    return { planilla, errores: [{ hoja: '(archivo)', fila: 0, mensaje: 'El archivo no se pudo leer como una planilla .xlsx.' }] };
  }

  const filasDe = (clavePlanilla: keyof typeof HOJAS): Array<{ fila: number; valores: Record<string, string> }> => {
    const nombre = HOJAS[clavePlanilla];
    const hoja = libro.worksheets.find((h) => normalizar(h.name) === normalizar(nombre));
    if (hoja === undefined) {
      errores.push({ hoja: nombre, fila: 0, mensaje: `Falta la hoja «${nombre}».` });
      return [];
    }
    const posiciones = new Map<string, number>();
    hoja.getRow(1).eachCell((celda, columna) => posiciones.set(normalizar(textoDe(celda)), columna));
    const faltantes = COLUMNAS[clavePlanilla].filter((c) => !OPCIONALES.has(normalizar(c)) && !posiciones.has(normalizar(c)));
    if (faltantes.length > 0) {
      errores.push({ hoja: nombre, fila: 1, mensaje: `Faltan las columnas ${faltantes.map((c) => `«${c}»`).join(', ')} en el encabezado.` });
      return [];
    }
    // Sin contar el encabezado.
    if (hoja.rowCount - 1 > MAXIMO_FILAS_POR_HOJA) {
      errores.push({ hoja: nombre, fila: 0, mensaje: `La hoja tiene más de ${String(MAXIMO_FILAS_POR_HOJA)} filas.` });
      return [];
    }
    const salida: Array<{ fila: number; valores: Record<string, string> }> = [];
    for (let fila = 2; fila <= hoja.rowCount; fila += 1) {
      const row = hoja.getRow(fila);
      const valores: Record<string, string> = {};
      for (const columna of COLUMNAS[clavePlanilla]) {
        const posicion = posiciones.get(normalizar(columna));
        valores[normalizar(columna)] = posicion === undefined ? '' : textoDe(row.getCell(posicion));
      }
      // Una fila totalmente vacía (formato residual) no es una fila de datos.
      if (Object.values(valores).every((v) => v === '')) continue;
      salida.push({ fila, valores });
    }
    return salida;
  };

  const vacios = (hoja: string, fila: number, valores: Record<string, string>, obligatorias: string[]): boolean => {
    let hay = false;
    for (const c of obligatorias) {
      if ((valores[normalizar(c)] ?? '') === '') {
        errores.push({ hoja, fila, mensaje: `La columna «${c}» está vacía.` });
        hay = true;
      }
    }
    return hay;
  };
  const sinRepetir = <T extends { fila: number }>(hoja: string, items: T[], claveDe: (i: T) => string, descripcion: (i: T) => string): void => {
    const vistos = new Map<string, number>();
    for (const i of items) {
      const k = claveDe(i);
      const antes = vistos.get(k);
      if (antes === undefined) vistos.set(k, i.fila);
      else errores.push({ hoja, fila: i.fila, mensaje: `${descripcion(i)} está repetido (ya aparece en la fila ${String(antes)}).` });
    }
  };

  for (const { fila, valores } of filasDe('sectores')) {
    if (!vacios(HOJAS.sectores, fila, valores, ['Nombre'])) planilla.sectores.push({ fila, nombre: valores['nombre'] ?? '' });
  }
  for (const { fila, valores } of filasDe('carreras')) {
    if (!vacios(HOJAS.carreras, fila, valores, ['Sector', 'Nombre'])) planilla.carreras.push({ fila, sector: valores['sector'] ?? '', nombre: valores['nombre'] ?? '' });
  }
  for (const { fila, valores } of filasDe('asignaturas')) {
    if (vacios(HOJAS.asignaturas, fila, valores, ['Carrera', 'Tipo', 'Nombre'])) continue;
    const tipo = normalizar(valores['tipo'] ?? '') === 'asignatura' ? 'ASIGNATURA' : normalizar(valores['tipo'] ?? '') === 'modulo' ? 'MODULO' : undefined;
    if (tipo === undefined) {
      errores.push({ hoja: HOJAS.asignaturas, fila, mensaje: `El tipo «${valores['tipo'] ?? ''}» no es válido: usa Asignatura o Módulo.` });
      continue;
    }
    planilla.asignaturas.push({ fila, carrera: valores['carrera'] ?? '', tipo, nombre: valores['nombre'] ?? '', codigo: (valores['codigo'] ?? '') === '' ? null : (valores['codigo'] ?? '') });
  }
  for (const { fila, valores } of filasDe('canales')) {
    if (vacios(HOJAS.canales, fila, valores, ['Nombre', 'Activo'])) continue;
    const activo = ['si', 'sí'].includes((valores['activo'] ?? '').trim().toLowerCase()) ? true : normalizar(valores['activo'] ?? '') === 'no' ? false : undefined;
    if (activo === undefined) {
      errores.push({ hoja: HOJAS.canales, fila, mensaje: `El valor «${valores['activo'] ?? ''}» de «Activo» no es válido: usa sí o no.` });
      continue;
    }
    planilla.canales.push({ fila, nombre: valores['nombre'] ?? '', activo });
  }

  sinRepetir(HOJAS.sectores, planilla.sectores, (s) => clave(s.nombre), (s) => `El sector «${s.nombre}»`);
  sinRepetir(HOJAS.carreras, planilla.carreras, (c) => clave(c.nombre), (c) => `La carrera «${c.nombre}»`);
  sinRepetir(HOJAS.asignaturas, planilla.asignaturas, (a) => clave(a.carrera, a.tipo, a.nombre), (a) => `«${a.nombre}» de ${a.carrera}`);
  sinRepetir(HOJAS.asignaturas, planilla.asignaturas.filter((a) => a.codigo !== null), (a) => clave(a.carrera, a.codigo ?? ''), (a) => `El código «${a.codigo ?? ''}» de ${a.carrera}`);
  sinRepetir(HOJAS.canales, planilla.canales, (c) => clave(c.nombre), (c) => `El canal «${c.nombre}»`);
  return { planilla, errores };
}

function resolver(ids: ReadonlyMap<string, string>, nombre: string, que: string): string {
  const id = ids.get(clave(nombre));
  if (id === undefined) throw new ErrorDeUso(`${que} «${nombre}» sin resolver`);
  return id;
}

const sinConteo = (): ConteoHoja => ({ nuevos: 0, actualizados: 0, sinCambios: 0 });

/**
 * Valida la planilla contra la base y, si todo está bien y no es `prueba`, la carga en una sola transacción.
 * Inserta lo nuevo y actualiza lo que cambió (el sector de una carrera, el código de una asignatura, `activo` de un canal);
 * nunca borra: lo que está en la base y no en la planilla queda como está.
 */
export async function cargarCatalogos(prisma: PrismaClient, contenido: Buffer, opciones: { prueba?: boolean } = {}): Promise<ResultadoCarga> {
  const resultado: ResultadoCarga = {
    errores: [],
    aplicado: false,
    resumen: { sectores: sinConteo(), carreras: sinConteo(), asignaturas: sinConteo(), canales: sinConteo() },
    noIncluidos: [],
  };
  const { planilla, errores } = await leerPlanilla(contenido);
  resultado.errores = errores;

  const [sectoresBd, carrerasBd, asignaturasBd, canalesBd] = await Promise.all([
    prisma.sector.findMany({ select: { id: true, nombre: true } }),
    prisma.carrera.findMany({ select: { id: true, nombre: true, sectorId: true } }),
    prisma.asignatura.findMany({ select: { id: true, carreraId: true, tipo: true, nombre: true, codigo: true } }),
    prisma.canal.findMany({ select: { id: true, nombre: true, activo: true } }),
  ]);
  const sectorPorClave = new Map(sectoresBd.map((s) => [clave(s.nombre), s]));
  const carreraPorClave = new Map(carrerasBd.map((c) => [clave(c.nombre), c]));
  const sectoresArchivo = new Set(planilla.sectores.map((s) => clave(s.nombre)));
  const carrerasArchivo = new Set(planilla.carreras.map((c) => clave(c.nombre)));

  // Referencias: el sector de una carrera y la carrera de una asignatura existen en la planilla o en la base.
  for (const c of planilla.carreras) {
    if (!sectoresArchivo.has(clave(c.sector)) && !sectorPorClave.has(clave(c.sector))) {
      resultado.errores.push({ hoja: HOJAS.carreras, fila: c.fila, mensaje: `El sector «${c.sector}» no está en la hoja «Sectores» ni en la base.` });
    }
  }
  for (const a of planilla.asignaturas) {
    if (!carrerasArchivo.has(clave(a.carrera)) && !carreraPorClave.has(clave(a.carrera))) {
      resultado.errores.push({ hoja: HOJAS.asignaturas, fila: a.fila, mensaje: `La carrera «${a.carrera}» no está en la hoja «Carreras» ni en la base.` });
    }
  }
  // Un código ya usado por otra asignatura de la misma carrera chocaría con la restricción única de la base.
  for (const a of planilla.asignaturas) {
    const carrera = carreraPorClave.get(clave(a.carrera));
    if (a.codigo === null || carrera === undefined) continue;
    const dueno = asignaturasBd.find((x) => x.carreraId === carrera.id && x.codigo === a.codigo);
    if (dueno !== undefined && !(dueno.tipo === a.tipo && clave(dueno.nombre) === clave(a.nombre))) {
      resultado.errores.push({ hoja: HOJAS.asignaturas, fila: a.fila, mensaje: `El código «${a.codigo}» ya lo usa otra asignatura de ${a.carrera} en la base.` });
    }
  }
  resultado.errores.sort((x, y) => x.hoja.localeCompare(y.hoja) || x.fila - y.fila);

  // Plan: qué es nuevo, qué cambió y qué sigue igual. Se calcula también con errores solo para no dejar el resumen a medias;
  // sin errores es lo que se escribe.
  const { resumen } = resultado;
  const nuevosSectores = planilla.sectores.filter((s) => !sectorPorClave.has(clave(s.nombre)));
  resumen.sectores = { nuevos: nuevosSectores.length, actualizados: 0, sinCambios: planilla.sectores.length - nuevosSectores.length };

  const nuevasCarreras = planilla.carreras.filter((c) => !carreraPorClave.has(clave(c.nombre)));
  const carrerasCambiadas = planilla.carreras.filter((c) => {
    const bd = carreraPorClave.get(clave(c.nombre));
    return bd !== undefined && bd.sectorId !== sectorPorClave.get(clave(c.sector))?.id;
  });
  resumen.carreras = { nuevos: nuevasCarreras.length, actualizados: carrerasCambiadas.length, sinCambios: planilla.carreras.length - nuevasCarreras.length - carrerasCambiadas.length };

  const asignaturaBd = (a: FilaAsignatura) => {
    const carrera = carreraPorClave.get(clave(a.carrera));
    return carrera === undefined ? undefined : asignaturasBd.find((x) => x.carreraId === carrera.id && x.tipo === a.tipo && clave(x.nombre) === clave(a.nombre));
  };
  const nuevasAsignaturas = planilla.asignaturas.filter((a) => asignaturaBd(a) === undefined);
  const asignaturasCambiadas = planilla.asignaturas.filter((a) => {
    const bd = asignaturaBd(a);
    return bd !== undefined && a.codigo !== null && bd.codigo !== a.codigo;
  });
  resumen.asignaturas = { nuevos: nuevasAsignaturas.length, actualizados: asignaturasCambiadas.length, sinCambios: planilla.asignaturas.length - nuevasAsignaturas.length - asignaturasCambiadas.length };

  const canalBd = (c: FilaCanal) => canalesBd.find((x) => clave(x.nombre) === clave(c.nombre));
  const nuevosCanales = planilla.canales.filter((c) => canalBd(c) === undefined);
  const canalesCambiados = planilla.canales.filter((c) => canalBd(c) !== undefined && canalBd(c)?.activo !== c.activo);
  resumen.canales = { nuevos: nuevosCanales.length, actualizados: canalesCambiados.length, sinCambios: planilla.canales.length - nuevosCanales.length - canalesCambiados.length };

  const enArchivo = (hoja: string): Set<string> =>
    new Set(
      hoja === HOJAS.sectores ? planilla.sectores.map((s) => clave(s.nombre))
        : hoja === HOJAS.carreras ? planilla.carreras.map((c) => clave(c.nombre))
          : hoja === HOJAS.asignaturas ? planilla.asignaturas.map((a) => clave(a.carrera, a.tipo, a.nombre))
            : planilla.canales.map((c) => clave(c.nombre)),
    );
  const nombreCarreraDe = new Map(carrerasBd.map((c) => [c.id, c.nombre]));
  const archivoSectores = enArchivo(HOJAS.sectores);
  const archivoCarreras = enArchivo(HOJAS.carreras);
  const archivoAsignaturas = enArchivo(HOJAS.asignaturas);
  const archivoCanales = enArchivo(HOJAS.canales);
  resultado.noIncluidos = [
    ...sectoresBd.filter((s) => !archivoSectores.has(clave(s.nombre))).map((s) => ({ hoja: HOJAS.sectores, nombre: s.nombre })),
    ...carrerasBd.filter((c) => !archivoCarreras.has(clave(c.nombre))).map((c) => ({ hoja: HOJAS.carreras, nombre: c.nombre })),
    ...asignaturasBd.filter((a) => !archivoAsignaturas.has(clave(nombreCarreraDe.get(a.carreraId) ?? '', a.tipo, a.nombre))).map((a) => ({ hoja: HOJAS.asignaturas, nombre: `${nombreCarreraDe.get(a.carreraId) ?? ''} / ${a.nombre}` })),
    ...canalesBd.filter((c) => !archivoCanales.has(clave(c.nombre))).map((c) => ({ hoja: HOJAS.canales, nombre: c.nombre })),
  ];

  if (resultado.errores.length > 0 || opciones.prueba === true) return resultado;

  await prisma.$transaction(
    async (tx) => {
      await tx.sector.createMany({ data: nuevosSectores.map((s) => ({ nombre: s.nombre })) });
      const sectores = new Map((await tx.sector.findMany({ select: { id: true, nombre: true } })).map((s) => [clave(s.nombre), s.id]));
      const idSector = (nombre: string): string => resolver(sectores, nombre, 'Sector');
      await tx.carrera.createMany({ data: nuevasCarreras.map((c) => ({ nombre: c.nombre, sectorId: idSector(c.sector) })) });
      for (const c of carrerasCambiadas) {
        const bd = carreraPorClave.get(clave(c.nombre));
        if (bd !== undefined) await tx.carrera.update({ where: { id: bd.id }, data: { sectorId: idSector(c.sector) } });
      }
      const carreras = new Map((await tx.carrera.findMany({ select: { id: true, nombre: true } })).map((c) => [clave(c.nombre), c.id]));
      const idCarrera = (nombre: string): string => resolver(carreras, nombre, 'Carrera');
      await tx.asignatura.createMany({ data: nuevasAsignaturas.map((a) => ({ carreraId: idCarrera(a.carrera), tipo: a.tipo, nombre: a.nombre, codigo: a.codigo })) });
      for (const a of asignaturasCambiadas) {
        const bd = asignaturaBd(a);
        if (bd !== undefined) await tx.asignatura.update({ where: { id: bd.id }, data: { codigo: a.codigo } });
      }
      await tx.canal.createMany({ data: nuevosCanales.map((c) => ({ nombre: c.nombre, activo: c.activo })) });
      for (const c of canalesCambiados) {
        const bd = canalBd(c);
        if (bd !== undefined) await tx.canal.update({ where: { id: bd.id }, data: { activo: c.activo } });
      }
    },
    { timeout: 60_000 },
  );
  resultado.aplicado = true;
  return resultado;
}

/** Planilla de ejemplo con los datos ficticios del prototipo, para que TI vea el formato y la reemplace por los reales. */
export async function generarPlantilla(): Promise<Buffer> {
  const libro = new Workbook();
  const agregar = (nombre: string, encabezado: readonly string[], filas: ReadonlyArray<ReadonlyArray<string>>): void => {
    const hoja = libro.addWorksheet(nombre);
    hoja.addRow([...encabezado]).font = { bold: true };
    for (const fila of filas) hoja.addRow([...fila]);
    hoja.columns.forEach((columna) => (columna.width = 36));
  };
  agregar(HOJAS.sectores, COLUMNAS.sectores, SECTORES_EJEMPLO.map((s) => [s]));
  agregar(HOJAS.carreras, COLUMNAS.carreras, CARRERAS_EJEMPLO.map((c) => [c.sector, c.nombre]));
  agregar(HOJAS.asignaturas, COLUMNAS.asignaturas, CARRERAS_EJEMPLO.flatMap((c) => [...c.asignaturas.map((a) => [c.nombre, 'Asignatura', a, '']), ...c.modulos.map((m) => [c.nombre, 'Módulo', m, ''])]));
  agregar(HOJAS.canales, COLUMNAS.canales, CANALES_EJEMPLO.map((c) => [c, 'sí']));
  return Buffer.from(await libro.xlsx.writeBuffer());
}
