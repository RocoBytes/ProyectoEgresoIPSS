import { BadRequestException, type ValidationError } from '@nestjs/common';
import type { ErrorValidacion } from '@ipss/shared';

export const MENSAJE_DATOS_INVALIDOS = 'La solicitud tiene datos inválidos';
const MENSAJE_CAMPO_NO_PERMITIDO = 'Campo no permitido';

// class-validator nombra así la restricción que produce `forbidNonWhitelisted`.
const RESTRICCION_FUERA_DE_LISTA = 'whitelistValidation';

/** Aplana errores anidados con rutas con puntos ("participantes.0.nombre"). Un mensaje por campo: el primero. */
export function aplanarErrores(errores: readonly ValidationError[], prefijo = ''): ErrorValidacion[] {
  const salida: ErrorValidacion[] = [];
  for (const error of errores) {
    const campo = prefijo === '' ? error.property : `${prefijo}.${error.property}`;
    const restricciones = error.constraints ?? {};
    const claves = Object.keys(restricciones);
    if (claves.length > 0) {
      const mensaje = claves.includes(RESTRICCION_FUERA_DE_LISTA) ? MENSAJE_CAMPO_NO_PERMITIDO : (restricciones[claves[0] ?? ''] ?? MENSAJE_DATOS_INVALIDOS);
      salida.push({ campo, mensaje });
    }
    if (error.children !== undefined) salida.push(...aplanarErrores(error.children, campo));
  }
  return salida;
}

/** `exceptionFactory` del ValidationPipe: el filtro global agrega `idPeticion`. */
export function fabricarErrorDeValidacion(errores: ValidationError[]): BadRequestException {
  return new BadRequestException({ statusCode: 400, message: MENSAJE_DATOS_INVALIDOS, errores: aplanarErrores(errores) });
}
