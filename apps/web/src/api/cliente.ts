import type { RespuestaSalud } from '@ipss/shared';

/**
 * Error de una respuesta HTTP inesperada; conserva el estado para decidir reintentos
 * y el cuerpo ya leído (si lo había) para que las pantallas muestren los detalles.
 */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly cuerpo: unknown;

  constructor(estado: number, mensaje: string, cuerpo?: unknown) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.cuerpo = cuerpo;
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

// ---------------------------------------------------------------------------
// Sesión: renovación automática tras un 401
// ---------------------------------------------------------------------------

const PREFIJO_ACCESO = '/api/acceso/';

type Oyente = () => void;
const oyentesDeExpiracion = new Set<Oyente>();

/** Avisa cuando la sesión ya no se puede recuperar. Devuelve la función para dejar de escuchar. */
export function alExpirarSesion(oyente: Oyente): () => void {
  oyentesDeExpiracion.add(oyente);
  return () => {
    oyentesDeExpiracion.delete(oyente);
  };
}

function emitirExpiracion(): void {
  for (const oyente of [...oyentesDeExpiracion]) oyente();
}

// Un solo POST /renovar a la vez: con la rotación del refresh token, dos llamadas
// simultáneas con la misma cookie harían que la segunda llegara con una cookie ya usada.
let renovacionEnCurso: Promise<boolean> | null = null;

/** Renueva la sesión compartiendo la llamada entre quienes la pidan a la vez. `true` si la API aceptó. */
export function renovarSesion(): Promise<boolean> {
  renovacionEnCurso ??= fetch(`${PREFIJO_ACCESO}renovar`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
    .then((respuesta) => respuesta.ok)
    // Un fallo de red no es una sesión vencida: se informa como "no renovó" y el reintento decide.
    .catch(() => false)
    .finally(() => {
      renovacionEnCurso = null;
    });
  return renovacionEnCurso;
}

export interface OpcionesSolicitud {
  metodo?: 'GET' | 'POST';
  cuerpo?: unknown;
  /** Ante un 401, renovar y repetir una vez. Por defecto, todo lo que no es /api/acceso/*. */
  renovarAlExpirar?: boolean;
  /** Si tras reintentar sigue el 401, avisar a la aplicación. Por defecto igual que `renovarAlExpirar`. */
  avisarExpiracion?: boolean;
}

function enviar(ruta: string, opciones: OpcionesSolicitud): Promise<Response> {
  const tieneCuerpo = opciones.cuerpo !== undefined;
  return fetch(ruta, {
    method: opciones.metodo ?? 'GET',
    credentials: 'same-origin',
    headers: tieneCuerpo
      ? { Accept: 'application/json', 'Content-Type': 'application/json' }
      : { Accept: 'application/json' },
    body: tieneCuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
}

async function ejecutar(ruta: string, opciones: OpcionesSolicitud): Promise<Response> {
  const renovarAlExpirar = opciones.renovarAlExpirar ?? !ruta.startsWith(PREFIJO_ACCESO);
  const avisarExpiracion = opciones.avisarExpiracion ?? renovarAlExpirar;

  let respuesta = await enviar(ruta, opciones);
  if (respuesta.status === 401 && renovarAlExpirar) {
    // Se reintenta aunque la renovación falle: otra pestaña pudo rotar la cookie justo antes
    // y la API responde 401 sin revocar nada durante esa ventana de gracia.
    await renovarSesion();
    respuesta = await enviar(ruta, opciones);
    if (respuesta.status === 401 && avisarExpiracion) emitirExpiracion();
  }
  return respuesta;
}

async function leerCuerpo(respuesta: Response): Promise<unknown> {
  try {
    const cuerpo: unknown = await respuesta.json();
    return cuerpo;
  } catch {
    return undefined;
  }
}

function mensajeDe(cuerpo: unknown, estado: number): string {
  if (typeof cuerpo === 'object' && cuerpo !== null && 'message' in cuerpo) {
    const { message } = cuerpo;
    if (typeof message === 'string') return message;
  }
  return `Respuesta inesperada de la API (${String(estado)})`;
}

async function comprobar(respuesta: Response): Promise<void> {
  if (respuesta.ok) return;
  const cuerpo = await leerCuerpo(respuesta);
  throw new ErrorApi(respuesta.status, mensajeDe(cuerpo, respuesta.status), cuerpo);
}

/** Petición que responde con JSON. Lanza ErrorApi si el estado no es 2xx. */
export async function solicitarJson<T>(ruta: string, opciones: OpcionesSolicitud = {}): Promise<T> {
  const respuesta = await ejecutar(ruta, opciones);
  await comprobar(respuesta);
  return (await respuesta.json()) as T;
}

/** Petición que responde sin contenido (204). Lanza ErrorApi si el estado no es 2xx. */
export async function solicitarSinContenido(ruta: string, opciones: OpcionesSolicitud = {}): Promise<void> {
  await comprobar(await ejecutar(ruta, opciones));
}
