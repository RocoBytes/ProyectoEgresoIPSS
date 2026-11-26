// Contratos de /api/acceso. La API y la web los comparten para que un cambio de forma
// rompa la compilación en ambos lados y no en producción.
export type Rol = 'DIRECTOR_SECTORIAL' | 'DIRECTOR_CARRERA' | 'ASEGURAMIENTO_CALIDAD';

export interface ReferenciaNombrada {
  id: string;
  nombre: string;
}

/**
 * Lo que el usuario puede modificar.
 * - Dirección Sectorial: sus sectores y las carreras de esos sectores.
 * - Dirección de Carrera: solo sus carreras.
 * - Aseguramiento de la Calidad: ambas listas vacías; consulta todo y no modifica nada.
 */
export interface Alcance {
  /** Texto para mostrar, como en el prototipo ("Tecnologías e Ingeniería"). */
  descripcion: string;
  sectores: ReferenciaNombrada[];
  carreras: ReferenciaNombrada[];
}

/** Respuesta de POST /api/acceso/ingresar y de GET /api/acceso/yo. */
export interface UsuarioActual {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  etiquetaRol: string;
  alcance: Alcance;
  /** Falso para Aseguramiento de la Calidad: el botón «Nueva sesión» no se muestra. */
  puedeCrear: boolean;
}

/** 401 de POST /ingresar: idéntico exista o no el correo. */
export interface RespuestaCredencialesIncorrectas {
  statusCode: 401;
  message: string;
  /** Intentos que quedan antes de que la cuenta se bloquee. */
  intentosRestantes: number;
  idPeticion?: string;
}

/** 429 de POST /ingresar cuando la cuenta está bloqueada. */
export interface RespuestaCuentaBloqueada {
  statusCode: 429;
  message: string;
  /** Marca de tiempo ISO 8601 (UTC) en que se podrá intentar de nuevo. */
  bloqueadoHasta: string;
  idPeticion?: string;
}
