import type { DatosSesionNueva, RespuestaCatalogos, RespuestaObjetosCarrera, RespuestaSesionCreada } from '@ipss/shared';
import { solicitarJson } from '../api/cliente';

export const obtenerCatalogos = () => solicitarJson<RespuestaCatalogos>('/api/catalogos');
export const obtenerObjetos = (carreraId: string) =>
  solicitarJson<RespuestaObjetosCarrera>(`/api/catalogos/carreras/${carreraId}/objetos`);

/** Sesión + acta + fotos en un solo multipart: `datos` va como JSON y los archivos por su nombre de campo. */
export function crearSesion(datos: DatosSesionNueva, acta: File, fotos: File[]): Promise<RespuestaSesionCreada> {
  const formulario = new FormData();
  formulario.append('datos', JSON.stringify(datos));
  formulario.append('acta', acta);
  for (const foto of fotos) formulario.append('fotos', foto);
  return solicitarJson<RespuestaSesionCreada>('/api/sesiones', { metodo: 'POST', formulario });
}
