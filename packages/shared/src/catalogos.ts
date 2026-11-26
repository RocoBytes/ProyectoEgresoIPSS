import type { ReferenciaNombrada } from './acceso.js';

/** Respuesta de GET /api/catalogos. */
export interface RespuestaCatalogos {
  sectores: ReferenciaNombrada[];
  carreras: Array<ReferenciaNombrada & { sectorId: string }>;
  /** Solo canales activos; «Otro» va al final. */
  canales: ReferenciaNombrada[];
}

/** Respuesta de GET /api/catalogos/carreras/:id/objetos. */
export interface RespuestaObjetosCarrera {
  asignaturas: ReferenciaNombrada[];
  modulos: ReferenciaNombrada[];
  /** Más reciente primero. `vigenteDesde` es AAAA-MM-DD. */
  versionesMalla: Array<{ id: string; anio: number; vigenteDesde: string }>;
}
