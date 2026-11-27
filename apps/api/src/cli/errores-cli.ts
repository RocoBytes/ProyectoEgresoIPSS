import { Prisma } from '../generated/prisma/client';

/** Error de uso o de datos cuyo mensaje ya está pensado para el operador: se muestra tal cual. */
export class ErrorDeUso extends Error {}

const SQLSTATE_PERMISO_DENEGADO = '42501';
const SQLSTATE_UNICO = '23505';
// Prisma agrupa en P1xxx los fallos de conexión; P2024 es el agotamiento del pool.
const CODIGOS_SIN_CONEXION = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const KINDS_SIN_CONEXION = new Set(['DatabaseNotReachable', 'ConnectionClosed', 'SocketTimeout', 'TooManyConnections']);
const CODIGOS_DE_RED = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH']);

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/** SQLSTATE y `kind` que el adaptador pg deja en `meta.driverAdapterError.cause` (ADR 0006); nunca se lee `message` ni `detail`. */
function causaDelAdaptador(error: Prisma.PrismaClientKnownRequestError): { sqlstate?: string; kind?: string } {
  const adaptador = error.meta?.['driverAdapterError'];
  const causa = esObjeto(adaptador) ? adaptador['cause'] : undefined;
  if (!esObjeto(causa)) return {};
  const codigo = causa['code'] ?? causa['originalCode'];
  return { sqlstate: typeof codigo === 'string' ? codigo : undefined, kind: typeof causa['kind'] === 'string' ? causa['kind'] : undefined };
}

/** Errores de red de Node (a veces dentro de un AggregateError o de `cause`). */
function esErrorDeRed(error: unknown, profundidad = 0): boolean {
  if (!esObjeto(error) || profundidad > 4) return false;
  if (typeof error['code'] === 'string' && CODIGOS_DE_RED.has(error['code'])) return true;
  const agregados: unknown[] = Array.isArray(error['errors']) ? error['errors'] : [];
  const internos: unknown[] = [error['cause'], ...agregados];
  return internos.some((e) => esErrorDeRed(e, profundidad + 1));
}

/**
 * Mensaje en español y accionable para un fallo inesperado. Nunca incluye el texto original del error
 * (Prisma lo acompaña de la consulta, y la base puede nombrar la fila) ni la pila.
 */
export function describirError(error: unknown): string {
  if (error instanceof ErrorDeUso) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const { sqlstate, kind } = causaDelAdaptador(error);
    if (error.code === 'P2002' || sqlstate === SQLSTATE_UNICO) {
      return 'Otra operación creó al mismo tiempo los mismos datos, así que este cambio no se aplicó. Revisa el estado actual y vuelve a ejecutar el comando.';
    }
    if (sqlstate === SQLSTATE_PERMISO_DENEGADO) {
      return 'La base negó el permiso para esta operación: el usuario de la conexión (ipss_api) no tiene el privilegio necesario. Avisa a quien administra la base; no se aplicó ningún cambio.';
    }
    if (error.code === 'P1000' || sqlstate === '28P01' || sqlstate === '28000' || kind === 'AuthenticationFailed') {
      return 'La base rechazó el usuario o la contraseña de DATABASE_URL. Revisa las credenciales.';
    }
    if (error.code === 'P1003' || sqlstate === '3D000' || kind === 'DatabaseDoesNotExist') {
      return 'La base indicada en DATABASE_URL no existe. Revisa el nombre de la base.';
    }
    if (CODIGOS_SIN_CONEXION.has(error.code) || (kind !== undefined && KINDS_SIN_CONEXION.has(kind))) return MENSAJE_SIN_CONEXION;
  }
  if (error instanceof Prisma.PrismaClientInitializationError || esErrorDeRed(error)) return MENSAJE_SIN_CONEXION;
  const codigo = esObjeto(error) ? error['code'] : undefined;
  if (codigo === 'EEXIST') return 'El archivo de salida ya existe: no se sobrescribe. Elige otro nombre o bórralo antes.';
  if (codigo === 'ENOENT') return 'No se encontró el archivo indicado.';
  if (codigo === 'EACCES' || codigo === 'EPERM' || codigo === 'EROFS') return 'No hay permiso para leer o escribir ese archivo (en el contenedor de producción el sistema de archivos es de solo lectura: usa `-` para leer de la entrada estándar).';
  return 'La operación falló por un error inesperado. Vuelve a intentarlo; si se repite, avisa a quien administra el sistema.';
}

const MENSAJE_SIN_CONEXION = 'No se pudo conectar con la base de datos. Revisa que esté en ejecución y que DATABASE_URL apunte al servidor correcto.';
