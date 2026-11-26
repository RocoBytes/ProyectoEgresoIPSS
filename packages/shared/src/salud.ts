// Respuesta de GET /api/salud. La API y la web la comparten para que un cambio
// de forma rompa la compilación en ambos lados y no en producción.
export interface RespuestaSalud {
  estado: 'ok' | 'error';
  baseDeDatos: 'ok' | 'sin_conexion';
  /** Marca de tiempo ISO 8601 (UTC) del momento de la comprobación. */
  verificadoEn: string;
}
