import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, PayloadTooLargeException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { MulterField } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { catchError, defer, finalize, mergeAll, type Observable, throwError } from 'rxjs';
import { CONFIGURACION, type Configuracion } from '../configuracion';
import { SUBDIRECTORIO_ENTRANTES } from './disco-local';

export const MAXIMO_BYTES_ARCHIVO = 20 * 1024 * 1024;
export const MAXIMO_FOTOS = 10;
// Tope del envío completo (acta + fotos + campos). Caddy (413 sin cuerpo) y Cloudflare (su página de error)
// rechazan primero por Content-Length, sin mensaje de la API; la web lo evita avisando antes de enviar y traduce ese 413 al mismo mensaje.
// Esta comprobación es la autoridad cuando no hay proxy delante (desarrollo) y nunca lee el cuerpo.
// Decimal a propósito: Caddy interpreta `100MB` como 100.000.000 de bytes, no 100 MiB.
export const MAXIMO_BYTES_ENVIO = 100 * 1000 * 1000;
const MENSAJE_ENVIO_GRANDE = 'El envío supera los 100 MB en total. Adjunta menos fotos o reduce su tamaño.';
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
 * Base común de las subidas: recibe los campos de archivo indicados en `.entrantes` con nombre UUID,
 * nunca el nombre del cliente. Los límites de Multer se traducen a mensajes en español: 413 para el peso, 400 para el resto.
 */
abstract class SubidaBase implements NestInterceptor {
  private readonly interno: NestInterceptor;
  private readonly mensajes: Readonly<Record<string, string>>;

  protected constructor(config: Configuracion, campos: MulterField[], maximoArchivos: number, mensajeDemasiadosArchivos: string) {
    this.mensajes = { ...MENSAJES_DE_MULTER, 'Too many files': mensajeDemasiadosArchivos };
    const Interceptor = FileFieldsInterceptor(campos, {
      storage: diskStorage({
        destination: join(config.directorioEvidencias, SUBDIRECTORIO_ENTRANTES),
        filename: (_peticion, _archivo, devolver) => devolver(null, randomUUID()),
      }),
      limits: { fileSize: MAXIMO_BYTES_ARCHIVO, files: maximoArchivos, fields: 5, fieldSize: 1024 * 1024 },
    });
    this.interno = new Interceptor();
  }

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    // Antes de Multer: así el cuerpo no se lee ni se escribe nada en disco. Sin cabecera válida
    // (p. ej. transferencia fragmentada) valen los límites por archivo y el tope de Caddy.
    const peticion = contexto.switchToHttp().getRequest<PeticionConArchivos>();
    const cabecera = peticion.headers['content-length'];
    if (excedeTamanoEnvio(Array.isArray(cabecera) ? cabecera[0] : cabecera)) {
      return throwError(() => new PayloadTooLargeException({ statusCode: 413, message: MENSAJE_ENVIO_GRANDE }));
    }
    // El interceptor interno es asíncrono y entrega una Promise de Observable: `mergeAll` aplana ese Observable interno.
    return defer(async () => this.interno.intercept(contexto, siguiente)).pipe(
      mergeAll(),
      catchError((error: unknown) => throwError(() => traducir(error, this.mensajes))),
      // Se ejecute o no el caso de uso (un :id mal formado falla en un pipe, después de Multer), no puede quedar nada en `.entrantes`.
      // Lo que el servicio ya movió con `incorporar` no existe en esa ruta y `force` lo ignora.
      finalize(() => void limpiarTemporales(peticion)),
    );
  }
}

interface PeticionConArchivos {
  headers: Record<string, string | string[] | undefined>;
  file?: { path?: string };
  files?: Array<{ path?: string }> | Record<string, Array<{ path?: string }>>;
}

/** Borra los temporales que Multer escribió para esta petición; un fallo al borrar nunca cambia la respuesta. */
async function limpiarTemporales(peticion: PeticionConArchivos): Promise<void> {
  const archivos = [...(peticion.file === undefined ? [] : [peticion.file]), ...(Array.isArray(peticion.files) ? peticion.files : Object.values(peticion.files ?? {}).flat())];
  await Promise.all(archivos.flatMap((a) => (a.path === undefined ? [] : [rm(a.path, { force: true }).catch(() => undefined)])));
}

/** `true` si el Content-Length declara más de 100 MB. Exactamente el tope se permite; lo ausente o no numérico, también. */
export function excedeTamanoEnvio(contentLength: string | undefined): boolean {
  if (contentLength === undefined || !/^\d+$/.test(contentLength.trim())) return false;
  return Number(contentLength.trim()) > MAXIMO_BYTES_ENVIO;
}

export function traducir(error: unknown, mensajes: Readonly<Record<string, string>> = MENSAJES_DE_MULTER): unknown {
  if (error instanceof PayloadTooLargeException) return new PayloadTooLargeException({ statusCode: 413, message: MENSAJE_ARCHIVO_GRANDE });
  if (error instanceof BadRequestException) {
    const cuerpo = error.getResponse();
    const mensaje = typeof cuerpo === 'object' && 'message' in cuerpo ? cuerpo.message : cuerpo;
    // Nest entrega el campo ajeno como «Unexpected file field - <campo>», no como el «Unexpected field» de Multer.
    const clave = typeof mensaje === 'string' && mensaje.startsWith('Unexpected file field') ? 'Unexpected field' : mensaje;
    const traducido = typeof clave === 'string' ? mensajes[clave] : undefined;
    if (traducido !== undefined) return new BadRequestException({ statusCode: 400, message: traducido });
  }
  return error;
}

/** Sesión nueva: `acta` (1) y `fotos` (hasta 10). */
@Injectable()
export class SubidaEvidenciasInterceptor extends SubidaBase {
  constructor(@Inject(CONFIGURACION) config: Configuracion) {
    super(
      config,
      [
        { name: 'acta', maxCount: 1 },
        { name: 'fotos', maxCount: MAXIMO_FOTOS },
      ],
      MAXIMO_FOTOS + 1,
      'Adjunta como máximo un acta y 10 fotos.',
    );
  }
}

/** Cierre de un registro: una sola `evidencia`. */
@Injectable()
export class SubidaEvidenciaCierreInterceptor extends SubidaBase {
  constructor(@Inject(CONFIGURACION) config: Configuracion) {
    super(config, [{ name: 'evidencia', maxCount: 1 }], 1, 'Adjunta una sola evidencia.');
  }
}
