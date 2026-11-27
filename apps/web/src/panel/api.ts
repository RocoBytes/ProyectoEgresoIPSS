import type { RespuestaPanel } from '@ipss/shared';
import { solicitarJson } from '../api/cliente';

export interface FiltrosPanel {
  anio: string;
  sectorId: string;
  carreraId: string;
}

export function obtenerPanel(filtros: FiltrosPanel): Promise<RespuestaPanel> {
  const parametros = new URLSearchParams();
  if (filtros.anio !== '') parametros.set('anio', filtros.anio);
  if (filtros.sectorId !== '') parametros.set('sectorId', filtros.sectorId);
  if (filtros.carreraId !== '') parametros.set('carreraId', filtros.carreraId);
  const texto = parametros.toString();
  return solicitarJson<RespuestaPanel>(`/api/reportes/panel${texto === '' ? '' : `?${texto}`}`);
}
