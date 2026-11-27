import { type ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { FiltroErrores, mensajeDeCheckViolation } from './filtro-errores';

interface Capturado {
  estado?: number;
  cuerpo?: unknown;
}

function ejecutar(error: unknown): Capturado {
  const capturado: Capturado = {};
  const respuesta = {
    status: (estado: number) => {
      capturado.estado = estado;
      return respuesta;
    },
    json: (cuerpo: unknown) => {
      capturado.cuerpo = cuerpo;
    },
  };
  const peticion = { idPeticion: 'id-de-prueba', method: 'GET', path: '/api/x' };
  const host = {
    switchToHttp: () => ({ getRequest: () => peticion, getResponse: () => respuesta }),
  } as unknown as ArgumentsHost;
  new FiltroErrores().catch(error, host);
  return capturado;
}

// Formas observadas en la sonda contra Prisma 7.10.1 y PostgreSQL 16 (ADR 0006).
function errorDeAdaptador(code: string, meta: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database error', { code, clientVersion: '7.10.1', meta });
}

const causaCheck = {
  originalCode: '23514',
  originalMessage: 'new row for relation "registro" violates check constraint "registro_cierre_completo"',
  kind: 'postgres',
  code: '23514',
  severity: 'ERROR',
  message: 'new row for relation "registro" violates check constraint "registro_cierre_completo"',
  detail: 'Failing row contains (secreto-personal).',
};
const causaTrigger = {
  originalCode: '23514',
  originalMessage: 'El registro R-2026-184 está cerrado y no admite modificaciones',
  kind: 'postgres',
  code: '23514',
  severity: 'ERROR',
  message: 'El registro R-2026-184 está cerrado y no admite modificaciones',
};

describe('FiltroErrores', () => {
  let registrarError: jest.SpyInstance;

  beforeEach(() => {
    registrarError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('conserva estado y cuerpo de una HttpException y agrega el id de petición', () => {
    const r = ejecutar(new BadRequestException({ statusCode: 400, message: ['campo inválido'], error: 'Bad Request' }));
    expect(r.estado).toBe(400);
    expect(r.cuerpo).toEqual({ statusCode: 400, message: ['campo inválido'], error: 'Bad Request', idPeticion: 'id-de-prueba' });
  });

  it('envuelve el mensaje de texto de una HttpException', () => {
    const r = ejecutar(new NotFoundException('nada'));
    expect(r.estado).toBe(404);
    expect(r.cuerpo).toMatchObject({ idPeticion: 'id-de-prueba' });
  });

  it('traduce errores de body-parser (JSON mal formado) a 400 con mensaje genérico', () => {
    const error = Object.assign(new SyntaxError('Unexpected token } in JSON at position 5'), { status: 400, statusCode: 400, expose: true, type: 'entity.parse.failed' });
    const r = ejecutar(error);
    expect(r.estado).toBe(400);
    expect(r.cuerpo).toEqual({ statusCode: 400, message: 'La solicitud no se pudo interpretar', idPeticion: 'id-de-prueba' });
  });

  it('traduce un cuerpo demasiado grande a 413', () => {
    const r = ejecutar(Object.assign(new Error('request entity too large'), { status: 413, expose: true }));
    expect(r.estado).toBe(413);
  });

  it('no trata como 4xx un error con status pero sin expose', () => {
    expect(ejecutar(Object.assign(new Error('x'), { status: 400 })).estado).toBe(500);
  });

  it('P2025 pasa a 404', () => {
    const r = ejecutar(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '7.10.1', meta: { modelName: 'Registro', operation: 'an update' } }));
    expect(r.estado).toBe(404);
  });

  it.each(['P2002', 'P2003'])('%s pasa a 409 sin valores de columnas', (code) => {
    const r = ejecutar(errorDeAdaptador(code, { modelName: 'Canal', driverAdapterError: { cause: { originalMessage: 'valor-secreto' } } }));
    expect(r.estado).toBe(409);
    expect(JSON.stringify(r.cuerpo)).not.toContain('valor-secreto');
  });

  it('23514 de un CHECK por la API de modelos (P2039) pasa a 409 con el mensaje de la base', () => {
    const r = ejecutar(errorDeAdaptador('P2039', { modelName: 'Registro', driverAdapterError: { name: 'DriverAdapterError', cause: causaCheck } }));
    expect(r.estado).toBe(409);
    expect(r.cuerpo).toEqual({ statusCode: 409, message: causaCheck.message, idPeticion: 'id-de-prueba' });
  });

  it('23514 de un trigger por SQL crudo (P2010) pasa a 409 con el mensaje de la base', () => {
    const r = ejecutar(errorDeAdaptador('P2010', { driverAdapterError: { name: 'DriverAdapterError', cause: causaTrigger } }));
    expect(r.estado).toBe(409);
    expect(r.cuerpo).toMatchObject({ message: 'El registro R-2026-184 está cerrado y no admite modificaciones' });
  });

  it('nunca expone el detalle con la fila completa del CHECK', () => {
    const r = ejecutar(errorDeAdaptador('P2039', { driverAdapterError: { cause: causaCheck } }));
    expect(JSON.stringify(r.cuerpo)).not.toContain('secreto-personal');
  });

  it('un 23505 (otro SQLSTATE) no se confunde con un 23514', () => {
    expect(mensajeDeCheckViolation(errorDeAdaptador('P2002', { driverAdapterError: { cause: { code: '23505', message: 'x' } } }))).toBeUndefined();
  });

  it('un error de Prisma sin traducción conocida cae en 500 genérico', () => {
    const r = ejecutar(new Prisma.PrismaClientKnownRequestError('conexión con clave', { code: 'P1001', clientVersion: '7.10.1' }));
    expect(r.estado).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain('clave');
  });

  it('un error inesperado devuelve 500 sin detalle interno y lo registra con el id', () => {
    const r = ejecutar(new Error('fallo interno con contraseña=123'));
    expect(r.estado).toBe(500);
    expect(r.cuerpo).toEqual({ statusCode: 500, message: 'Error interno del servidor', idPeticion: 'id-de-prueba' });
    expect(registrarError).toHaveBeenCalledWith(expect.stringContaining('[id-de-prueba]'), expect.any(String));
  });

  it('un valor lanzado que no es Error también da 500', () => {
    expect(ejecutar('texto suelto').estado).toBe(500);
  });
});
