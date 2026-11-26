import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { BadRequestException, CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { catchError, defer, mergeAll, type Observable, throwError } from 'rxjs';
import { CONFIGURACION, type Configuracion } from '../configuracion';
import { SUBDIRECTORIO_ENTRANTES } from './disco-local';

export const MAXIMO_BYTES_ARCHIVO = 20 * 1024 * 1024;
export const MAXIMO_FOTOS = 10;
const MENSAJE_ARCHIVO_GRANDE = 'El archivo pesa más de 20 MB. Reduce el archivo o divídelo.';

// Mensajes en inglés con los que @nestjs/platform-express traduce los límites de Multer.
const MENSAJES_DE_MULTER: Readonly<Record<string, string>> = {
  'Too many files': 'Adjunta como máximo un acta y 10 fotos.',
  'Unexpected field': 'La solicitud trae un archivo que no corresponde.',
  'Too many parts': 'La solicitud trae demasiadas partes.',
  'Too many fields': 'La solicitud trae demasiados campos.',
  'Field value too long': 'Un campo de la solicitud es demasiado largo.',
  'Field name too long': 'Un campo de la solicitud tiene un nombre demasiado largo.',
};

/**
 * Recibe `acta` (1) y `fotos` (hasta 10) en `.entrantes` con nombre UUID: nunca el nombre del cliente.
 * Los límites de Multer se traducen a mensajes en español: 413 para el peso, 400 para el resto.
 */
@Injectable()
export class SubidaEvidenciasInterceptor implements NestInterceptor {
  private readonly interno: NestInterceptor;

  constructor(@Inject(CONFIGURACION) config: Configuracion) {
    const Interceptor = FileFieldsInterceptor(
      [
        { name: 'acta', maxCount: 1 },
        { name: 'fotos', maxCount: MAXIMO_FOTOS },
      ],
      {
        storage: diskStorage({
          destination: join(config.directorioEvidencias, SUBDIRECTORIO_ENTRANTES),
          filename: (_peticion, _archivo, devolver) => devolver(null, randomUUID()),
        }),
        limits: { fileSize: MAXIMO_BYTES_ARCHIVO, files: MAXIMO_FOTOS + 1, fields: 5, fieldSize: 1024 * 1024 },
      },
    );
    this.interno = new Interceptor();
  }

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    // El interceptor interno es asíncrono y entrega una Promise de Observable: `mergeAll` aplana ese Observable interno.
    return defer(async () => this.interno.intercept(contexto, siguiente)).pipe(
      mergeAll(),
      catchError((error: unknown) => throwError(() => traducir(error))),
    );
  }
}

export function traducir(error: unknown): unknown {
  if (error instanceof PayloadTooLargeException) return new PayloadTooLargeException({ statusCode: 413, message: MENSAJE_ARCHIVO_GRANDE });
  if (error instanceof BadRequestException) {
    const cuerpo = error.getResponse();
    const mensaje = typeof cuerpo === 'object' && 'message' in cuerpo ? cuerpo.message : cuerpo;
    const traducido = typeof mensaje === 'string' ? MENSAJES_DE_MULTER[mensaje] : undefined;
    if (traducido !== undefined) return new BadRequestException({ statusCode: 400, message: traducido });
  }
  return error;
}
