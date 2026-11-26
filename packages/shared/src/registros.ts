import type { ReferenciaNombrada } from './acceso.js';
import type { EstadoRegistro } from './index.js';
import type { EvidenciaResumen, NivelImpacto } from './sesiones.js';

/** Filtro `estado` del listado: VENCIDO es un ABIERTO con fecha comprometida anterior a hoy. */
export type FiltroEstado = EstadoRegistro | 'VENCIDO';

export interface FilaRegistro {
  id: string;
  correlativo: string;
  sesion: { id: string; fecha: string };
  carrera: ReferenciaNombrada;
  nivelImpacto: NivelImpacto;
  objeto: string;
  canal: string;
  fechaComprometida: string;
  estado: EstadoRegistro;
  vencido: boolean;
}

/** Respuesta de GET /api/registros. */
export interface RespuestaListadoRegistros {
  filas: FilaRegistro[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Respuesta de GET /api/registros/anios: años de las sesiones, de más reciente a más antiguo. */
export type RespuestaAnios = number[];

export interface EntradaHistorial {
  tipo: 'CREACION' | 'CIERRE' | 'ANULACION' | 'EDICION';
  /** ISO 8601. */
  fecha: string;
  usuario: string;
  /** Solo en EDICION: campo en camelCase y valores antes/después (las fechas, como texto). */
  cambios?: Record<string, { antes: unknown; despues: unknown }>;
}

export interface OtroRegistroDeSesion {
  id: string;
  correlativo: string;
  carrera: string;
  nivelImpacto: NivelImpacto;
  objeto: string;
}

/** Respuesta de GET /api/registros/:id. */
export interface DetalleRegistro {
  id: string;
  correlativo: string;
  estado: EstadoRegistro;
  vencido: boolean;
  sector: ReferenciaNombrada;
  carrera: ReferenciaNombrada;
  nivelImpacto: NivelImpacto;
  objeto: string;
  recurso: string | null;
  descripcion: string;
  fechaComprometida: string;
  fechaEfectiva: string | null;
  comentarioCierre: string | null;
  motivoAnulacion: string | null;
  evidenciaCierre: EvidenciaResumen | null;
  creadoEn: string;
  sesion: {
    id: string;
    canal: string;
    fecha: string;
    instancia: string;
    participantes: string[];
    creadoPor: string;
    evidencias: { acta: EvidenciaResumen | null; fotos: EvidenciaResumen[] };
  };
  historial: EntradaHistorial[];
  otrosRegistros: OtroRegistroDeSesion[];
  permisos: { puedeModificar: boolean; motivoConsulta?: string };
}

/** Cuerpo de PATCH /api/registros/:id. */
export interface EdicionRegistro {
  descripcion?: string;
  fechaComprometida?: string;
}

export interface RespuestaEdicion {
  sinCambios: boolean;
}
