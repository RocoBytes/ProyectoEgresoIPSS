import { describe, expect, it } from 'vitest';
import { ejeY, partesTexto, porcentaje, ultimoMes } from './calculos';

describe('calculos del panel', () => {
  it('el eje Y sigue la regla del prototipo', () => {
    expect(ejeY(0)).toEqual({ ticks: [0, 1, 2, 3], tope: 3 });
    expect(ejeY(4)).toEqual({ ticks: [0, 1, 2, 3, 4], tope: 4 });
    expect(ejeY(9)).toEqual({ ticks: [0, 2, 4, 6, 8, 10], tope: 10 });
    expect(ejeY(12)).toEqual({ ticks: [0, 5, 10, 15], tope: 15 });
    expect(ejeY(26).tope).toBe(30);
  });
  it('el porcentaje con denominador cero es 0', () => {
    expect(porcentaje(4, 13)).toBe(31);
    expect(porcentaje(3, 0)).toBe(0);
  });
  it('el último mes es el actual solo en el año en curso', () => {
    expect(ultimoMes(2026, '2026-11-26')).toBe(11);
    expect(ultimoMes(2025, '2026-11-26')).toBe(12);
  });
  it('el texto de estados usa singular y plural', () => {
    expect(partesTexto({ cerrados: 1, abiertos: 3, anulados: 0 })).toBe('1 cerrado, 3 abiertos');
  });
});
