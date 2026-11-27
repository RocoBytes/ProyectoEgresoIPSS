import type { DetalleRegistro, EdicionRegistro, RespuestaCambioEstado, RespuestaAnios, RespuestaEdicion, RespuestaListadoRegistros } from '@ipss/shared';
import { solicitarArchivo, solicitarJson } from '../api/cliente';

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

/** Traduce los parámetros de la URL de la web a los de la API; la exportación no lleva `pagina`. */
function parametrosApi(parametros: URLSearchParams, conPagina: boolean): string {
  const api = new URLSearchParams();
  for (const [web, nombreApi] of Object.entries(FILTROS_URL)) {
    if (web === 'pagina' && !conPagina) continue;
    const valor = parametros.get(web);
    if (valor !== null && valor !== '') api.set(nombreApi, valor);
  }
  return api.toString();
}

/** Excel con las mismas filas del listado filtrado, sin paginar. */
export function exportarRegistros(parametros: URLSearchParams) {
  const texto = parametrosApi(parametros, false);
  return solicitarArchivo(`/api/registros/exportar${texto === '' ? '' : `?${texto}`}`);
}

export function listarRegistros(parametros: URLSearchParams): Promise<RespuestaListadoRegistros> {
  const texto = parametrosApi(parametros, true);
  return solicitarJson<RespuestaListadoRegistros>(`/api/registros${texto === '' ? '' : `?${texto}`}`);
}

export const obtenerAnios = () => solicitarJson<RespuestaAnios>('/api/registros/anios');
export const obtenerDetalle = (id: string) => solicitarJson<DetalleRegistro>(`/api/registros/${id}`);
export const editarRegistro = (id: string, cuerpo: EdicionRegistro) =>
  solicitarJson<RespuestaEdicion>(`/api/registros/${id}`, { metodo: 'PATCH', cuerpo });

/** Cierre multipart: `datos` va como JSON y la evidencia por su nombre de campo. */
export function cerrarRegistro(id: string, datos: { fechaEfectiva: string; comentario?: string }, evidencia: File): Promise<RespuestaCambioEstado> {
  const formulario = new FormData();
  formulario.append('datos', JSON.stringify(datos));
  formulario.append('evidencia', evidencia);
  return solicitarJson<RespuestaCambioEstado>(`/api/registros/${id}/cierre`, { metodo: 'POST', formulario });
}

export const anularRegistro = (id: string, motivo: string) =>
  solicitarJson<RespuestaCambioEstado>(`/api/registros/${id}/anulacion`, { metodo: 'POST', cuerpo: { motivo } });
