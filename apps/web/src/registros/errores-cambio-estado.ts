import { ErrorApi } from '../api/cliente';
import { MENSAJE_ARCHIVO_GRANDE } from '../comun/archivos';

export interface ErrorTraducido {
  /** Mensajes por campo del formulario (los `errores` de un 400). */
  campos: Record<string, string>;
  /** Mensaje para mostrar en el diálogo cuando no pertenece a un campo. */
  general: string | null;
}

/** Traduce el fallo de cerrar o anular: la API es la autoridad, así que se muestra su mensaje tal cual. */
export function traducirErrorCambioEstado(error: unknown): ErrorTraducido {
  if (!(error instanceof ErrorApi)) {
    return { campos: {}, general: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.' };
  }
  const cuerpo = error.cuerpo as { errores?: Array<{ campo: string; mensaje: string }> } | undefined;
  if (error.estado === 400 && Array.isArray(cuerpo?.errores)) {
    const campos: Record<string, string> = {};
    for (const { campo, mensaje } of cuerpo.errores) campos[campo] = mensaje;
    return { campos, general: null };
  }
  // Un proxy (Caddy) corta por tamaño sin cuerpo: se explica igual que la API.
  if (error.estado === 413 && cuerpo === undefined) return { campos: {}, general: MENSAJE_ARCHIVO_GRANDE };
  return { campos: {}, general: error.message };
}
