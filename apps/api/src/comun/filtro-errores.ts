import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';

const SQLSTATE_CHECK_VIOLATION = '23514';

interface Traduccion {
  estado: number;
  mensaje: string;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * Prisma 7 con el adaptador pg entrega los 23514 (CHECK y trigger) como
 * PrismaClientKnownRequestError con código P2039 (API de modelos) o P2010 (SQL crudo).
 * El SQLSTATE y el mensaje de la base viven en `meta.driverAdapterError.cause`.
 * Se busca ahí y no en el código P20xx, que es genérico y cambia según la vía de acceso.
 * Ver docs/adr/0006-error-23514-en-prisma.md.
 */
export function mensajeDeCheckViolation(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  const adaptador = error.meta?.['driverAdapterError'];
  if (!esObjeto(adaptador)) return undefined;
  const causa = adaptador['cause'];
  if (!esObjeto(causa) || causa['code'] !== SQLSTATE_CHECK_VIOLATION) return undefined;
  // Se devuelve `message` y nunca `detail`: este último incluye la fila completa.
  return typeof causa['message'] === 'string' ? causa['message'] : undefined;
}

// body-parser y otros middlewares de Express lanzan errores http-errors (400 JSON mal
// formado, 413 cuerpo demasiado grande). Un filtro @Catch() los capturaría como 500.
function estadoDeErrorHttp(error: unknown): number | undefined {
  if (!esObjeto(error) || error['expose'] !== true) return undefined;
  const estado = error['status'] ?? error['statusCode'];
  return typeof estado === 'number' && estado >= 400 && estado < 500 ? estado : undefined;
}

function mensajeGenerico(estado: number): string {
  // Números literales: `estado` es un número arbitrario, no un miembro del enum HttpStatus.
  switch (estado) {
    case 400:
      return 'La solicitud no se pudo interpretar';
    case 413:
      return 'La solicitud es demasiado grande';
    case 415:
      return 'Tipo de contenido no admitido';
    default:
      return 'Solicitud no válida';
  }
}

function traducirPrisma(error: unknown): Traduccion | undefined {
  const mensajeBd = mensajeDeCheckViolation(error);
  if (mensajeBd !== undefined) return { estado: HttpStatus.CONFLICT, mensaje: mensajeBd };
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  switch (error.code) {
    case 'P2025':
      return { estado: HttpStatus.NOT_FOUND, mensaje: 'No se encontró el recurso solicitado' };
    case 'P2002':
      return { estado: HttpStatus.CONFLICT, mensaje: 'Ya existe un registro con esos datos' };
    case 'P2003':
      return { estado: HttpStatus.CONFLICT, mensaje: 'La operación referencia un registro que no existe o que está en uso' };
    default:
      return undefined;
  }
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly registro = new Logger(FiltroErrores.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const peticion = contexto.getRequest<Request>();
    const respuesta = contexto.getResponse<Response>();
    const idPeticion = peticion.idPeticion;

    if (error instanceof HttpException) {
      const cuerpo = error.getResponse();
      const estado = error.getStatus();
      respuesta.status(estado).json(
        typeof cuerpo === 'string' ? { statusCode: estado, message: cuerpo, idPeticion } : { ...cuerpo, idPeticion },
      );
      return;
    }

    const estadoHttp = estadoDeErrorHttp(error);
    if (estadoHttp !== undefined) {
      respuesta.status(estadoHttp).json({ statusCode: estadoHttp, message: mensajeGenerico(estadoHttp), idPeticion });
      return;
    }

    const traduccion = traducirPrisma(error);
    if (traduccion !== undefined) {
      respuesta.status(traduccion.estado).json({ statusCode: traduccion.estado, message: traduccion.mensaje, idPeticion });
      return;
    }

    // Se registra el nombre y el mensaje de la primera línea, sin cuerpo de la petición ni
    // parámetros de consulta, para no filtrar datos personales a los logs.
    const nombre = error instanceof Error ? error.name : typeof error;
    const detalle = error instanceof Error ? error.message.split('\n').find((l) => l.trim() !== '') ?? '' : '';
    // De la pila solo van los marcos ("at …"): `error.stack` repite el mensaje completo y en
    // Prisma ese mensaje puede incluir los argumentos de la consulta.
    const marcos = error instanceof Error ? error.stack?.split('\n').filter((l) => l.trimStart().startsWith('at ')).join('\n') : undefined;
    this.registro.error(`[${idPeticion ?? 'sin-id'}] ${peticion.method} ${peticion.path}: ${nombre} ${detalle}`, marcos);
    respuesta
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno del servidor', idPeticion });
  }
}
