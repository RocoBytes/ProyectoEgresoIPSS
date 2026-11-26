import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, type Reloj } from '../comun/reloj';

export const MAX_INTENTOS = 5;
export const DURACION_BLOQUEO_MS = 15 * 60_000;
// Tope de entradas: sin él, quien envía correos inventados sin parar agotaría la memoria.
// Con 10 usuarios reales, 10.000 entradas sobran para el uso legítimo.
const MAX_ENTRADAS = 10_000;

interface Entrada {
  intentos: number;
  bloqueadoHasta: Date | null;
  /** Después de este instante la entrada ya no cuenta y puede descartarse. */
  vigenteHasta: Date;
}

export type ResultadoFallo = { bloqueado: false; intentosRestantes: number } | { bloqueado: true; bloqueadoHasta: Date };

/**
 * Cuenta intentos fallidos de correos que no tienen cuenta, con las mismas reglas que
 * `usuario.intentos_fallidos` y `usuario.bloqueado_hasta`. Sin esto, un correo inexistente
 * nunca se bloquearía y la diferencia revelaría qué correos existen (ADR 0010).
 * Vive en memoria: se pierde al reiniciar, y para este fin (no revelar cuentas) basta.
 */
@Injectable()
export class IntentosDesconocidosService {
  // Un Map conserva el orden de inserción: la primera clave es la más antigua.
  private readonly entradas = new Map<string, Entrada>();

  constructor(@Inject(RELOJ) private readonly reloj: Reloj) {}

  bloqueadoHasta(correo: string): Date | null {
    const ahora = this.reloj.ahora();
    const entrada = this.entradas.get(correo);
    if (entrada === undefined) return null;
    if (entrada.vigenteHasta <= ahora) {
      this.entradas.delete(correo);
      return null;
    }
    return entrada.bloqueadoHasta !== null && entrada.bloqueadoHasta > ahora ? entrada.bloqueadoHasta : null;
  }

  registrarFallo(correo: string): ResultadoFallo {
    const ahora = this.reloj.ahora();
    const previa = this.entradas.get(correo);
    const intentos = (previa !== undefined && previa.vigenteHasta > ahora ? previa.intentos : 0) + 1;
    // Se reinserta para que quede al final del orden de antigüedad.
    this.entradas.delete(correo);
    if (intentos >= MAX_INTENTOS) {
      const bloqueadoHasta = new Date(ahora.getTime() + DURACION_BLOQUEO_MS);
      this.guardar(correo, { intentos: 0, bloqueadoHasta, vigenteHasta: bloqueadoHasta });
      return { bloqueado: true, bloqueadoHasta };
    }
    this.guardar(correo, { intentos, bloqueadoHasta: null, vigenteHasta: new Date(ahora.getTime() + DURACION_BLOQUEO_MS) });
    return { bloqueado: false, intentosRestantes: MAX_INTENTOS - intentos };
  }

  get tamano(): number {
    return this.entradas.size;
  }

  private guardar(correo: string, entrada: Entrada): void {
    if (this.entradas.size >= MAX_ENTRADAS) this.hacerEspacio();
    this.entradas.set(correo, entrada);
  }

  private hacerEspacio(): void {
    const ahora = this.reloj.ahora();
    for (const [clave, entrada] of this.entradas) {
      if (entrada.vigenteHasta <= ahora) this.entradas.delete(clave);
    }
    // Si todas siguen vigentes se descarta la más antigua: prefiere perder un contador a quedarse sin memoria.
    while (this.entradas.size >= MAX_ENTRADAS) {
      const masAntigua = this.entradas.keys().next();
      if (masAntigua.done === true) break;
      this.entradas.delete(masAntigua.value);
    }
  }
}
