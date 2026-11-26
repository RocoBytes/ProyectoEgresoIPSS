import type { ReferenciaNombrada } from './acceso.js';

export type NivelImpacto = 'RECURSO' | 'ASIGNATURA' | 'MODULO' | 'MALLA' | 'PERFIL_INGRESO' | 'PERFIL_EGRESO';

/** Un registro dentro del campo `datos` de POST /api/sesiones. Las fechas son AAAA-MM-DD. */
export interface RegistroNuevo {
  carreraId: string;
  nivelImpacto: NivelImpacto;
  asignaturaId?: string;
  versionMallaId?: string;
  recurso?: string;
  descripcion: string;
  fechaComprometida: string;
}

/** Contenido JSON del campo `datos` (multipart junto a los archivos `acta` y `fotos`). */
export interface DatosSesionNueva {
  canalId: string;
  fecha: string;
  instancia: string;
  participantes: string[];
  registros: RegistroNuevo[];
}

export interface RegistroCreado {
  id: string;
  correlativo: string;
  carrera: ReferenciaNombrada;
  nivelImpacto: NivelImpacto;
  objeto: string;
  fechaComprometida: string;
}

/** Respuesta 201 de POST /api/sesiones. */
export interface RespuestaSesionCreada {
  sesionId: string;
  fecha: string;
  instancia: string;
  registros: RegistroCreado[];
}

export interface EvidenciaResumen {
  id: string;
  nombreOriginal: string;
  mime: string;
  tamano: number;
  sha256: string;
}
