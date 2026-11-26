import type { Reloj } from '../comun/reloj';
import { IntentosDesconocidosService } from './intentos-desconocidos.service';

class RelojControlable implements Reloj {
  constructor(private actual = new Date('2026-11-26T12:00:00.000Z')) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

const MIN = 60_000;

describe('IntentosDesconocidosService', () => {
  let reloj: RelojControlable;
  let servicio: IntentosDesconocidosService;

  beforeEach(() => {
    reloj = new RelojControlable();
    servicio = new IntentosDesconocidosService(reloj);
  });

  it('reserva 1 a 5 sin bloquear; el quinto fallo bloquea 15 minutos', () => {
    const numeros = [1, 2, 3, 4, 5].map(() => servicio.reservar('a@x.cl'));
    expect(numeros).toEqual([1, 2, 3, 4, 5].map((n) => ({ yaBloqueado: false, n, bloqueadoHasta: null })));
    const hasta = servicio.bloquear('a@x.cl');
    expect(hasta).toEqual(new Date(reloj.ahora().getTime() + 15 * MIN));
    expect(servicio.reservar('a@x.cl')).toEqual({ yaBloqueado: true, bloqueadoHasta: hasta });
  });

  it('un sexto intento reservado antes del fallo del quinto bloquea en el mismo paso', () => {
    for (let i = 0; i < 5; i++) servicio.reservar('a@x.cl');
    const sexto = servicio.reservar('a@x.cl');
    expect(sexto).toEqual({ yaBloqueado: false, n: 6, bloqueadoHasta: new Date(reloj.ahora().getTime() + 15 * MIN) });
    expect(servicio.reservar('a@x.cl')).toMatchObject({ yaBloqueado: true });
  });

  it('el bloqueo termina a los 15 minutos y el conteo vuelve a empezar', () => {
    for (let i = 0; i < 6; i++) servicio.reservar('a@x.cl');
    reloj.avanzar(15 * MIN);
    expect(servicio.reservar('a@x.cl')).toMatchObject({ yaBloqueado: false, n: 1 });
  });

  it('el conteo se reinicia solo si el intento anterior tiene MÁS de 15 minutos', () => {
    servicio.reservar('a@x.cl');
    servicio.reservar('a@x.cl');
    reloj.avanzar(15 * MIN);
    expect(servicio.reservar('a@x.cl')).toMatchObject({ n: 3 });
    reloj.avanzar(15 * MIN + 1);
    expect(servicio.reservar('a@x.cl')).toMatchObject({ n: 1 });
  });

  it('cada correo lleva su propia cuenta', () => {
    servicio.reservar('a@x.cl');
    expect(servicio.reservar('b@x.cl')).toMatchObject({ n: 1 });
  });

  it('no crece sin límite: al llenarse descarta primero lo vencido y después lo más antiguo', () => {
    for (let i = 0; i < 10_000; i++) servicio.reservar(`n${i}@x.cl`);
    expect(servicio.tamano).toBe(10_000);
    servicio.reservar('nuevo@x.cl');
    expect(servicio.tamano).toBe(10_000);
    // La más antigua se perdió: vuelve a contar desde cero. Es el costo aceptado del tope (ADR 0010).
    expect(servicio.reservar('n0@x.cl')).toMatchObject({ n: 1 });
    reloj.avanzar(15 * MIN + 1);
    servicio.reservar('despues@x.cl');
    expect(servicio.tamano).toBe(1);
  });
});
