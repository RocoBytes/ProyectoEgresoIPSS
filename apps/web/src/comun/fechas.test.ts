import { describe, expect, it } from 'vitest';
import { diferenciaDias, fechaTexto, marcaTexto } from './fecha-texto';
import { tamanoTexto } from './tamano';

const fuentes = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('formato', () => {
  it('reordena fechas y calcula días sin Date', () => {
    expect(fechaTexto('2026-03-09')).toBe('09-03-2026');
    expect(diferenciaDias('2026-02-27', '2026-03-02')).toBe(3);
  });
  it('muestra marcas en Santiago', () => {
    expect(marcaTexto('2026-07-01T16:30:00Z')).toBe('01-07-2026 12:30');
  });
  it('tamaños', () => {
    expect(tamanoTexto(1_800_000)).toBe('1,8 MB');
    expect(tamanoTexto(2500)).toBe('3 KB');
  });
  it('ningún archivo construye un Date desde un texto literal', () => {
    const infractores = Object.entries(fuentes)
      .filter(([ruta]) => !/\.test\./.test(ruta))
      .filter(([, texto]) => /new Date\(\s*['"`]/.test(texto))
      .map(([ruta]) => ruta);
    expect(infractores).toEqual([]);
  });
});
