import type { EvidenciaResumen } from './sesiones.js';

/** Una versión de malla de una carrera. */
export interface VersionMallaListada {
  id: string;
  anio: number;
  /** AAAA-MM-DD. */
  vigenteDesde: string;
  /** Solo la versión de año más reciente de la carrera. */
  vigente: boolean;
  archivo: EvidenciaResumen;
  /** Nombre de quien subió el archivo. */
  subidaPor: string;
  /** ISO 8601. */
  creadaEn: string;
}

/** Respuesta de GET /api/mallas?carreraId. Más reciente primero. */
export interface RespuestaMallas {
  versiones: VersionMallaListada[];
  permisos: { puedeSubir: boolean; motivoConsulta?: string };
}

/** Campo `datos` (JSON) de POST /api/mallas; el PDF viaja aparte en el campo `archivo`. */
export interface DatosMallaNueva {
  carreraId: string;
  anio: number;
  /** AAAA-MM-DD. */
  vigenteDesde: string;
}
