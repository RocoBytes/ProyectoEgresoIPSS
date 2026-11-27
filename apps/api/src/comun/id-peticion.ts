import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    idPeticion?: string;
  }
}

// Siempre se genera uno nuevo: confiar en una cabecera del cliente permitiría
// falsificar el rastro en los logs.
export function asignarIdPeticion(peticion: Request, respuesta: Response, siguiente: NextFunction): void {
  const id = randomUUID();
  peticion.idPeticion = id;
  respuesta.setHeader('X-Request-Id', id);
  siguiente();
}
