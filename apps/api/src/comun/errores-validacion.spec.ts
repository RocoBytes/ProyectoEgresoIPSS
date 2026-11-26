import type { ValidationError } from '@nestjs/common';
import { aplanarErrores, fabricarErrorDeValidacion } from './errores-validacion';

const error = (property: string, constraints?: Record<string, string>, children?: ValidationError[]): ValidationError => ({ property, constraints, children });

describe('errores de validación', () => {
  it('aplana rutas anidadas con puntos y deja un mensaje por campo', () => {
    const errores = [
      error('correo', { isEmail: 'El correo no está completo.', maxLength: 'otro' }),
      error('participantes', undefined, [error('0', undefined, [error('nombre', { isString: 'Escribe el nombre.' })])]),
    ];
    expect(aplanarErrores(errores)).toEqual([
      { campo: 'correo', mensaje: 'El correo no está completo.' },
      { campo: 'participantes.0.nombre', mensaje: 'Escribe el nombre.' },
    ]);
  });

  it('una propiedad fuera de la lista blanca da "Campo no permitido"', () => {
    expect(aplanarErrores([error('intruso', { whitelistValidation: 'property intruso should not exist' })])).toEqual([{ campo: 'intruso', mensaje: 'Campo no permitido' }]);
  });

  it('arma un 400 con el formato compartido', () => {
    const excepcion = fabricarErrorDeValidacion([error('a', { isString: 'Mal.' })]);
    expect(excepcion.getStatus()).toBe(400);
    expect(excepcion.getResponse()).toEqual({ statusCode: 400, message: 'La solicitud tiene datos inválidos', errores: [{ campo: 'a', mensaje: 'Mal.' }] });
  });
});
