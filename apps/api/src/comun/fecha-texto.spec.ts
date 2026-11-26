import { aFechaBd, deFechaBd, esFechaTexto, hoyEnSantiago } from './fecha-texto';

const reloj = (iso: string) => ({ ahora: () => new Date(iso) });

describe('fecha-texto', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-1-01', '26-01-01', '2026-00-10', ''])('rechaza %p', (v) => expect(esFechaTexto(v)).toBe(false));
  it('acepta bisiesto real y rechaza el que no lo es', () => {
    expect(esFechaTexto('2028-02-29')).toBe(true);
    expect(esFechaTexto('2027-02-29')).toBe(false);
  });
  it('ida y vuelta sin correr el día', () => {
    expect(aFechaBd('2026-12-31').toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(deFechaBd(aFechaBd('2026-03-01'))).toBe('2026-03-01');
  });
  it('aFechaBd rechaza fechas inválidas', () => expect(() => aFechaBd('2026-02-30')).toThrow());
  it('hoy en Santiago usa el día local y no el de UTC', () => {
    expect(hoyEnSantiago(reloj('2027-01-01T02:30:00Z'))).toBe('2026-12-31');
  });
  it('alrededor de los cambios de hora de 2026', () => {
    // Fin del horario de verano: domingo 5 de abril de 2026, 24:00 -> 23:00 (UTC-3 a UTC-4).
    expect(hoyEnSantiago(reloj('2026-04-05T02:59:00Z'))).toBe('2026-04-04');
    expect(hoyEnSantiago(reloj('2026-04-05T03:00:00Z'))).toBe('2026-04-04');
    expect(hoyEnSantiago(reloj('2026-04-05T04:00:00Z'))).toBe('2026-04-05');
    // Inicio del horario de verano: domingo 6 de septiembre de 2026, 24:00 -> 01:00 (UTC-4 a UTC-3).
    expect(hoyEnSantiago(reloj('2026-09-06T03:59:00Z'))).toBe('2026-09-05');
    expect(hoyEnSantiago(reloj('2026-09-06T04:00:00Z'))).toBe('2026-09-06');
    expect(hoyEnSantiago(reloj('2026-09-06T03:00:00Z'))).toBe('2026-09-05');
  });
});
