import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { fileTypeFromFile } from 'file-type';

export interface ArchivoValidado {
  nombreOriginal: string;
  mime: string;
  tamano: number;
  sha256: string;
}

const MIMES_HEIC = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];

/** Multer entrega el nombre en latin1 aunque el navegador lo mandó en UTF-8: sin esto «Ñuñoa» llega como «Ã‘uÃ±oa». */
export function nombreEnUtf8(nombre: string): string {
  return Buffer.from(nombre, 'latin1').toString('utf8');
}

const LARGO_MAXIMO_NOMBRE = 255;

/** Nombre apto para guardar y mostrar: sin caracteres de control (CR/LF romperían cabeceras y logs), recortado y de a lo más 255 caracteres conservando la extensión. */
export function nombreSeguro(nombre: string): string {
  const limpio = nombreEnUtf8(nombre).replace(/\p{Cc}/gu, '').trim();
  const letras = Array.from(limpio);
  if (letras.length <= LARGO_MAXIMO_NOMBRE) return limpio;
  const punto = limpio.lastIndexOf('.');
  const extension = punto > 0 && limpio.length - punto <= 16 ? Array.from(limpio.slice(punto)) : [];
  return letras.slice(0, LARGO_MAXIMO_NOMBRE - extension.length).join('') + extension.join('');
}

/** SHA-256 por stream: el archivo nunca se carga entero en memoria. */
export function sha256DeStream(flujo: Readable): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const hash = createHash('sha256');
    flujo
      .on('data', (trozo: Buffer) => hash.update(trozo))
      .on('error', rechazar)
      .on('end', () => resolver(hash.digest('hex')));
  });
}

export const sha256DeArchivo = (ruta: string): Promise<string> => sha256DeStream(createReadStream(ruta));

/** El tipo se decide por el contenido (firma del archivo), nunca por la extensión ni por el Content-Type que declara el cliente. */
@Injectable()
export class ValidadorArchivos {
  /** Devuelve el archivo validado, o el mensaje de error para el usuario. */
  async validarActa(archivo: Express.Multer.File): Promise<ArchivoValidado | string> {
    const nombre = nombreSeguro(archivo.originalname);
    const tipo = await fileTypeFromFile(archivo.path);
    if (tipo?.mime !== 'application/pdf') return `“${nombre}” no es un PDF. El acta debe adjuntarse en PDF.`;
    return this.armar(archivo, nombre, tipo.mime);
  }

  async validarFoto(archivo: Express.Multer.File): Promise<ArchivoValidado | string> {
    const nombre = nombreSeguro(archivo.originalname);
    const tipo = await fileTypeFromFile(archivo.path);
    if (tipo?.mime === 'image/jpeg' || tipo?.mime === 'image/png') return this.armar(archivo, nombre, tipo.mime);
    const aviso = tipo !== undefined && MIMES_HEIC.includes(tipo.mime) ? ' Las fotos HEIC del iPhone hay que convertirlas a JPG antes de subirlas.' : '';
    return `“${nombre}” no es JPG ni PNG.${aviso}`;
  }

  private async armar(archivo: Express.Multer.File, nombreOriginal: string, mime: string): Promise<ArchivoValidado> {
    return { nombreOriginal, mime, tamano: archivo.size, sha256: await sha256DeArchivo(archivo.path) };
  }
}
