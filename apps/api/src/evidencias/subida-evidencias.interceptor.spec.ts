import { excedeTamanoEnvio, MAXIMO_BYTES_ENVIO } from './subida-evidencias.interceptor';

describe('excedeTamanoEnvio', () => {
  it('permite exactamente 100 MB decimales y rechaza un byte más', () => {
    expect(MAXIMO_BYTES_ENVIO).toBe(100_000_000);
    expect(excedeTamanoEnvio('100000000')).toBe(false);
    expect(excedeTamanoEnvio('100000001')).toBe(true);
  });

  it('deja pasar lo que no se puede medir: sin cabecera o no numérica', () => {
    expect(excedeTamanoEnvio(undefined)).toBe(false);
    expect(excedeTamanoEnvio('')).toBe(false);
    expect(excedeTamanoEnvio('abc')).toBe(false);
    expect(excedeTamanoEnvio('-5')).toBe(false);
  });
});
