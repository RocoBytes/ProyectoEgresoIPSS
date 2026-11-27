import { describe, expect, it } from 'vitest';
import { destinoSeguro } from './destino';

describe('destinoSeguro', () => {
  it('acepta rutas de la propia aplicación con su query', () => {
    expect(destinoSeguro('/registros?estado=abierto')).toBe('/registros?estado=abierto');
  });

  it.each([null, '', 'registros', '//evil.example', '/\\evil.example', 'https://evil.example', '/ingresar', '/ingresar?motivo=salida', '/a\nb'])(
    'rechaza %j y vuelve al panel',
    (volver) => {
      expect(destinoSeguro(volver)).toBe('/');
    },
  );
});
