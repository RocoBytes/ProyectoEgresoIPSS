import type { DetalleRegistro, EdicionRegistro, RespuestaAnios, RespuestaEdicion, RespuestaListadoRegistros } from '@ipss/shared';
import { solicitarJson } from '../api/cliente';

/** Nombre del parámetro en la URL de la web → nombre que espera la API. */
export const FILTROS_URL = {
  anio: 'anio',
  sector: 'sectorId',
  carrera: 'carreraId',
  asignatura: 'asignaturaId',
  canal: 'canalId',
  nivel: 'nivel',
  estado: 'estado',
  q: 'q',
  pagina: 'pagina',
} as const;

export function listarRegistros(parametros: URLSearchParams): Promise<RespuestaListadoRegistros> {
  const api = new URLSearchParams();
  for (const [web, nombreApi] of Object.entries(FILTROS_URL)) {
    const valor = parametros.get(web);
    if (valor !== null && valor !== '') api.set(nombreApi, valor);
  }
  const texto = api.toString();
  return solicitarJson<RespuestaListadoRegistros>(`/api/registros${texto === '' ? '' : `?${texto}`}`);
}

export const obtenerAnios = () => solicitarJson<RespuestaAnios>('/api/registros/anios');
export const obtenerDetalle = (id: string) => solicitarJson<DetalleRegistro>(`/api/registros/${id}`);
export const editarRegistro = (id: string, cuerpo: EdicionRegistro) =>
  solicitarJson<RespuestaEdicion>(`/api/registros/${id}`, { metodo: 'PATCH', cuerpo });
