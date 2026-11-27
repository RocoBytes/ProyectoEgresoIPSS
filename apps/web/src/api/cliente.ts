import type { RespuestaSalud } from '@ipss/shared';

/** Error de una respuesta HTTP inesperada; conserva el estado para decidir reintentos. */
export class ErrorApi extends Error {
  readonly estado: number;

  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
  }
}

/**
 * Un 503 es una respuesta válida: la API sigue en línea y su cuerpo informa que la base
 * no responde. Cualquier otro estado fuera de 200 sí es un fallo. Los errores de red
 * (fetch rechazado) se dejan pasar tal cual para distinguirlos de un ErrorApi.
 */
export async function obtenerSalud(): Promise<RespuestaSalud> {
  const respuesta = await fetch('/api/salud', { headers: { Accept: 'application/json' } });
  if (respuesta.status !== 200 && respuesta.status !== 503) {
    throw new ErrorApi(respuesta.status, `Respuesta inesperada de la API (${String(respuesta.status)})`);
  }
  return (await respuesta.json()) as RespuestaSalud;
}
