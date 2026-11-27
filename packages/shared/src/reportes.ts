import type { NivelImpacto } from './sesiones.js';

/** Registros por estado. «abiertos» incluye los vencidos. */
export interface ConteoPorEstado {
  cerrados: number;
  abiertos: number;
  anulados: number;
}

export interface IndicadoresPanel {
  /** Incluye los anulados. */
  total: number;
  /** Incluye los vencidos. */
  abiertos: number;
  /** Abiertos con fecha comprometida anterior a hoy. */
  vencidos: number;
  cerrados: number;
  anulados: number;
  /** total - anulados. */
  vigentes: number;
  /** Cerrados con fecha efectiva menor o igual a la comprometida. */
  enPlazo: number;
  carrerasConAjustes: number;
  /** Carreras del catálogo dentro del filtro de sector y carrera. */
  carrerasEnAlcance: number;
  /** null si el año anterior no tiene ajustes en todo el sistema («Primer año con ajustes»); si los tiene, el total filtrado (puede ser 0). */
  totalAnioAnterior: number | null;
}

export interface PanelMes extends ConteoPorEstado {
  /** 1 a 12, según la fecha de la sesión. */
  mes: number;
  total: number;
}

export interface PanelAnio {
  anio: number;
  total: number;
  /** 12 totales mensuales (enero a diciembre), con anulados. */
  meses: number[];
}

export interface PanelCanal {
  id: string;
  nombre: string;
  total: number;
}

export interface PanelNivel {
  nivel: NivelImpacto;
  total: number;
}

export interface PanelGrupo extends ConteoPorEstado {
  tipo: 'SECTOR' | 'CARRERA';
  id: string;
  nombre: string;
  total: number;
}

export interface PanelSesion {
  id: string;
  fecha: string;
  instancia: string;
  canal: string;
  creadoPor: string;
  /** Solo cuenta los registros que cumplen el filtro. */
  ajustes: number;
  primerRegistroId: string;
}

/** Respuesta de GET /api/reportes/panel. */
export interface RespuestaPanel {
  anio: number;
  /** AAAA-MM-DD en Santiago. */
  hoy: string;
  /** Años de las sesiones con registros, sin filtros, de más reciente a más antiguo. */
  aniosDisponibles: number[];
  indicadores: IndicadoresPanel;
  porMes: PanelMes[];
  porAnio: PanelAnio[];
  porCanal: PanelCanal[];
  porNivel: PanelNivel[];
  porGrupo: PanelGrupo[];
  ultimasSesiones: PanelSesion[];
}
