import type { DatosMallaNueva, RespuestaMallas, VersionMallaListada } from '@ipss/shared';
import { solicitarJson } from '../api/cliente';

export const obtenerMallas = (carreraId: string) => solicitarJson<RespuestaMallas>(`/api/mallas?carreraId=${encodeURIComponent(carreraId)}`);

/** Versión nueva en un multipart: `datos` va como JSON y el PDF por el campo `archivo`. */
export function subirMalla(datos: DatosMallaNueva, archivo: File): Promise<VersionMallaListada> {
  const formulario = new FormData();
  formulario.append('datos', JSON.stringify(datos));
  formulario.append('archivo', archivo);
  return solicitarJson<VersionMallaListada>('/api/mallas', { metodo: 'POST', formulario });
}
