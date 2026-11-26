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

describe('IntentosDesconocidosService', () => {
  let reloj: RelojControlable;
  let servicio: IntentosDesconocidosService;

  beforeEach(() => {
    reloj = new RelojControlable();
    servicio = new IntentosDesconocidosService(reloj);
  });

  it('cuenta cuatro fallos y bloquea 15 minutos en el quinto, igual que una cuenta real', () => {
    const restantes = [1, 2, 3, 4].map(() => servicio.registrarFallo('a@x.cl'));
    expect(restantes).toEqual([4, 3, 2, 1].map((n) => ({ bloqueado: false, intentosRestantes: n })));
    const quinto = servicio.registrarFallo('a@x.cl');
    expect(quinto).toEqual({ bloqueado: true, bloqueadoHasta: new Date(reloj.ahora().getTime() + 15 * 60_000) });
    expect(servicio.bloqueadoHasta('a@x.cl')).toEqual(new Date(reloj.ahora().getTime() + 15 * 60_000));
  });

  it('el bloqueo termina a los 15 minutos y el conteo vuelve a empezar', () => {
    for (let i = 0; i < 5; i++) servicio.registrarFallo('a@x.cl');
    reloj.avanzar(15 * 60_000);
    expect(servicio.bloqueadoHasta('a@x.cl')).toBeNull();
    expect(servicio.registrarFallo('a@x.cl')).toEqual({ bloqueado: false, intentosRestantes: 4 });
  });

  it('los intentos sin bloqueo se olvidan tras 15 minutos de calma', () => {
    servicio.registrarFallo('a@x.cl');
    servicio.registrarFallo('a@x.cl');
    reloj.avanzar(15 * 60_000 + 1);
    expect(servicio.registrarFallo('a@x.cl')).toEqual({ bloqueado: false, intentosRestantes: 4 });
  });

  it('cada correo lleva su propia cuenta', () => {
    servicio.registrarFallo('a@x.cl');
    expect(servicio.registrarFallo('b@x.cl')).toEqual({ bloqueado: false, intentosRestantes: 4 });
  });

  it('no crece sin límite: al llenarse descarta primero lo vencido y después lo más antiguo', () => {
    for (let i = 0; i < 10_000; i++) servicio.registrarFallo(`n${i}@x.cl`);
    expect(servicio.tamano).toBe(10_000);
    servicio.registrarFallo('nuevo@x.cl');
    expect(servicio.tamano).toBe(10_000);
    // La más antigua se perdió: vuelve a contar desde cero. Es el costo aceptado del tope (ADR 0010).
    expect(servicio.registrarFallo('n0@x.cl')).toEqual({ bloqueado: false, intentosRestantes: 4 });
    reloj.avanzar(15 * 60_000 + 1);
    servicio.registrarFallo('despues@x.cl');
    expect(servicio.tamano).toBe(1);
  });
});
