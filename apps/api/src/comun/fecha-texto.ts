import { registerDecorator, type ValidationOptions } from 'class-validator';
import type { Reloj } from './reloj';

// Único lugar donde se convierten las columnas DATE. Un `Date` de JavaScript con una fecha sin
// hora se interpreta en la zona del servidor y en Santiago muestra el día anterior (ADR 0011);
// por eso la API habla siempre en texto AAAA-MM-DD y estas funciones fijan UTC en ambos sentidos.

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formato AAAA-MM-DD y además un día que existe en el calendario (rechaza 2026-02-30). */
export function esFechaTexto(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const partes = FORMATO.exec(valor);
  if (partes === null) return false;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

/** Texto AAAA-MM-DD a `Date` en medianoche UTC, que es como Prisma entrega y recibe un DATE. */
export function aFechaBd(texto: string): Date {
  if (!esFechaTexto(texto)) throw new Error('Fecha inválida: ' + String(texto));
  return new Date(`${texto}T00:00:00.000Z`);
}

/** `Date` de una columna DATE a texto AAAA-MM-DD con los componentes UTC. */
export function deFechaBd(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

const FORMATEADOR_SANTIAGO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "Hoy" para el negocio: el día calendario en Santiago, no el de UTC (a las 23:30 en Santiago ya es mañana en UTC). */
export function hoyEnSantiago(reloj: Reloj): string {
  return FORMATEADOR_SANTIAGO.format(reloj.ahora());
}

/** Decorador de class-validator: la propiedad debe ser una fecha AAAA-MM-DD real. */
export function EsFechaTexto(opciones: ValidationOptions): PropertyDecorator {
  return (objeto, propiedad) => {
    registerDecorator({
      name: 'esFechaTexto',
      target: objeto.constructor,
      propertyName: String(propiedad),
      options: opciones,
      validator: { validate: (valor: unknown) => esFechaTexto(valor) },
    });
  };
}
