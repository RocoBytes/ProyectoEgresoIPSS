// Configuración tipada leída una sola vez al arrancar. La función es pura
// (recibe el entorno) para poder probarla sin tocar `process.env`.
export interface Configuracion {
  urlBaseDeDatos: string;
  puerto: number;
  host: string;
  /** Saltos de proxy confiables (Caddy = 1). `undefined` desactiva `trust proxy`. */
  saltosProxy: number | undefined;
  /** Secreto de firma de los JWT de acceso (HS256). */
  jwtSecreto: string;
}

// HS256 firma con HMAC: un secreto corto se adivina por fuerza bruta sin conexión.
const LARGO_MINIMO_JWT_SECRETO = 32;

export const CONFIGURACION = Symbol('CONFIGURACION');

type Entorno = Readonly<Record<string, string | undefined>>;

function enteroNoNegativo(nombre: string, valor: string): number {
  if (!/^\d+$/.test(valor)) {
    throw new Error(`${nombre} debe ser un número entero no negativo (se recibió "${valor}")`);
  }
  return Number(valor);
}

export function cargarConfiguracion(entorno: Entorno): Configuracion {
  const url = entorno['DATABASE_URL'];
  if (url === undefined || url.trim() === '') {
    throw new Error('Falta la variable de entorno DATABASE_URL (conexión a la base con el rol ipss_api)');
  }
  const secreto = entorno['JWT_SECRETO'];
  if (secreto === undefined || secreto.trim() === '') {
    throw new Error('Falta la variable de entorno JWT_SECRETO (secreto de firma de los JWT)');
  }
  if (secreto.length < LARGO_MINIMO_JWT_SECRETO) {
    throw new Error(`JWT_SECRETO debe tener al menos ${LARGO_MINIMO_JWT_SECRETO} caracteres`);
  }
  const puerto = entorno['PORT'];
  const proxy = entorno['TRUST_PROXY'];
  // En producción siempre hay un proxy delante (Caddy). Sin declararlo, `req.ip` sería la IP del proxy
  // y el límite por IP bloquearía a todos juntos; con un valor erróneo, la IP se podría falsear.
  if (entorno['NODE_ENV'] === 'production' && (proxy === undefined || proxy === '')) {
    throw new Error('Falta la variable de entorno TRUST_PROXY (saltos de proxy confiables; 1 detrás de Caddy) con NODE_ENV=production');
  }
  return {
    urlBaseDeDatos: url,
    puerto: puerto === undefined || puerto === '' ? 3000 : enteroNoNegativo('PORT', puerto),
    // Por defecto solo escucha en loopback; Compose fija 0.0.0.0 dentro del contenedor.
    host: entorno['HOST'] === undefined || entorno['HOST'] === '' ? '127.0.0.1' : entorno['HOST'],
    saltosProxy: proxy === undefined || proxy === '' ? undefined : enteroNoNegativo('TRUST_PROXY', proxy),
    jwtSecreto: secreto,
  };
}
