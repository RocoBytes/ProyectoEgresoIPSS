import { ErrorApi } from './cliente';

export const MAXIMO_REINTENTOS = 2;

/**
 * Los 4xx no mejoran al repetirse (la petición está mal), así que no se reintentan;
 * los 5xx y los fallos de red sí, hasta dos veces.
 */
export function debeReintentar(intentosPrevios: number, error: unknown): boolean {
  if (error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) {
    return false;
  }
  return intentosPrevios < MAXIMO_REINTENTOS;
}
