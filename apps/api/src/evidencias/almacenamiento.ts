import type { ReadStream } from 'node:fs';

/**
 * Dónde viven los archivos de las evidencias. Hoy es disco local; la interfaz existe para
 * cambiarlo por un almacenamiento compatible con S3 sin tocar los casos de uso (ADR 0013).
 */
export interface AlmacenamientoEvidencias {
  /** Mueve un archivo recién subido (en `.entrantes`) a su lugar definitivo y devuelve su ruta relativa. */
  incorporar(rutaTemporal: string): Promise<string>;
  abrir(rutaRelativa: string): ReadStream;
  borrar(rutaRelativa: string): Promise<void>;
}

export const ALMACENAMIENTO_EVIDENCIAS = Symbol('ALMACENAMIENTO_EVIDENCIAS');
