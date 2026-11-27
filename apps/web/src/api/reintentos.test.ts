import { describe, expect, it } from 'vitest';
import { ErrorApi } from './cliente';
import { debeReintentar } from './reintentos';

describe('debeReintentar', () => {
  it('no reintenta respuestas 4xx', () => {
    expect(debeReintentar(0, new ErrorApi(404, 'no existe'))).toBe(false);
    expect(debeReintentar(0, new ErrorApi(400, 'mala petición'))).toBe(false);
  });

  it('reintenta respuestas 5xx hasta dos veces', () => {
    const error = new ErrorApi(500, 'falla');
    expect(debeReintentar(0, error)).toBe(true);
    expect(debeReintentar(1, error)).toBe(true);
    expect(debeReintentar(2, error)).toBe(false);
  });

  it('reintenta errores de red hasta dos veces', () => {
    const error = new TypeError('Failed to fetch');
    expect(debeReintentar(0, error)).toBe(true);
    expect(debeReintentar(1, error)).toBe(true);
    expect(debeReintentar(2, error)).toBe(false);
  });
});
