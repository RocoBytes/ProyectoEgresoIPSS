import { Prisma } from '../generated/prisma/client';

// Índice único de (carrera_id, anio) en version_malla; ver la migración inicial.
const INDICE_CARRERA_ANIO = 'version_malla_carrera_id_anio_key';

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * `true` solo para la violación de unicidad de (carrera, año). Prisma 7 con el adaptador pg no llena `meta.target`:
 * el índice viene en `meta.driverAdapterError.cause.constraint.index` (ver ADR 0006 para la misma vía con el 23514).
 * Cualquier otra violación única (p. ej. el archivo ya usado por otra versión) no es «ya existe la malla».
 */
export function esDuplicadoDeAnioDeMalla(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const adaptador = error.meta?.['driverAdapterError'];
  const causa = esObjeto(adaptador) ? adaptador['cause'] : undefined;
  const restriccion = esObjeto(causa) ? causa['constraint'] : undefined;
  if (esObjeto(restriccion) && typeof restriccion['index'] === 'string') return restriccion['index'] === INDICE_CARRERA_ANIO;
  // Respaldo para clientes que sí informan `target` (columnas o nombre del índice).
  const objetivo = error.meta?.['target'];
  if (Array.isArray(objetivo)) return objetivo.includes('carrera_id') && objetivo.includes('anio');
  return objetivo === INDICE_CARRERA_ANIO;
}
