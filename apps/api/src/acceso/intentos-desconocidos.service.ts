import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, type Reloj } from '../comun/reloj';

export const MAX_INTENTOS = 5;
export const DURACION_BLOQUEO_MS = 15 * 60_000;
/** Un intento más viejo que esto ya no cuenta: el contador vuelve a empezar (igual en la base y aquí). */
export const VENTANA_INTENTOS_MS = 15 * 60_000;
// Tope de entradas: sin él, quien envía correos inventados sin parar agotaría la memoria.
// Con 10 usuarios reales, 10.000 entradas sobran para el uso legítimo.
const MAX_ENTRADAS = 10_000;

interface Entrada {
  intentos: number;
  ultimoIntentoEn: Date;
  bloqueadoHasta: Date | null;
}

export type Reserva = { yaBloqueado: true; bloqueadoHasta: Date } | { yaBloqueado: false; n: number; bloqueadoHasta: Date | null };

/**
 * Lleva los intentos de correos que no tienen cuenta con las mismas reglas que las columnas
 * `usuario.intentos_fallidos`, `ultimo_fallo_en` y `bloqueado_hasta`. Sin esto, un correo
 * inexistente nunca se bloquearía y esa diferencia revelaría que no existe (ADR 0010).
 * Vive en memoria: se pierde al reiniciar y, al llenarse, descarta lo más antiguo.
 */
@Injectable()
export class IntentosDesconocidosService {
  // Un Map conserva el orden de inserción: la primera clave es la más antigua.
  private readonly entradas = new Map<string, Entrada>();

  constructor(@Inject(RELOJ) private readonly reloj: Reloj) {}

  /**
   * Reserva el intento ANTES de verificar la contraseña. Es síncrona a propósito: en Node nada
   * se intercala entre leer y escribir, así que dos ingresos simultáneos nunca reservan el mismo número.
   * Si el número reservado supera el máximo, el correo queda bloqueado en este mismo paso.
   */
  reservar(correo: string): Reserva {
    const ahora = this.reloj.ahora();
    const previa = this.entradas.get(correo);
    if (previa?.bloqueadoHasta != null && previa.bloqueadoHasta > ahora) return { yaBloqueado: true, bloqueadoHasta: previa.bloqueadoHasta };

    const vigente = previa !== undefined && ahora.getTime() - previa.ultimoIntentoEn.getTime() <= VENTANA_INTENTOS_MS;
    const n = (vigente ? previa.intentos : 0) + 1;
    // Se reinserta para que quede al final del orden de antigüedad.
    this.entradas.delete(correo);
    if (n > MAX_INTENTOS) {
      const bloqueadoHasta = new Date(ahora.getTime() + DURACION_BLOQUEO_MS);
      this.guardar(correo, { intentos: 0, ultimoIntentoEn: ahora, bloqueadoHasta });
      return { yaBloqueado: false, n, bloqueadoHasta };
    }
    this.guardar(correo, { intentos: n, ultimoIntentoEn: ahora, bloqueadoHasta: null });
    return { yaBloqueado: false, n, bloqueadoHasta: null };
  }

  /** El intento número MAX_INTENTOS falló: bloquea. Devuelve el fin del bloqueo (el vigente si ya lo había). */
  bloquear(correo: string): Date {
    const ahora = this.reloj.ahora();
    const previa = this.entradas.get(correo);
    if (previa?.bloqueadoHasta != null && previa.bloqueadoHasta > ahora) return previa.bloqueadoHasta;
    const bloqueadoHasta = new Date(ahora.getTime() + DURACION_BLOQUEO_MS);
    this.entradas.delete(correo);
    this.guardar(correo, { intentos: 0, ultimoIntentoEn: previa?.ultimoIntentoEn ?? ahora, bloqueadoHasta });
    return bloqueadoHasta;
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
      const bloqueada = entrada.bloqueadoHasta !== null && entrada.bloqueadoHasta > ahora;
      if (!bloqueada && ahora.getTime() - entrada.ultimoIntentoEn.getTime() > VENTANA_INTENTOS_MS) this.entradas.delete(clave);
    }
    // Si todas siguen vigentes se descarta la más antigua: prefiere perder un contador a quedarse sin memoria.
    while (this.entradas.size >= MAX_ENTRADAS) {
      const masAntigua = this.entradas.keys().next();
      if (masAntigua.done === true) break;
      this.entradas.delete(masAntigua.value);
    }
  }
}
