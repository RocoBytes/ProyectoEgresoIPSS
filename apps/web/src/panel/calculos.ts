import type { ConteoPorEstado } from '@ipss/shared';
import { plural } from '../comun/plural';

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Colores de relleno del prototipo; los gráficos de Recharts los reciben como valores, no como clases. */
export const COLORES = {
  cerrados: '#2f8f5b',
  abiertos: '#0077c2',
  anulados: '#8e887f',
  vencidos: '#c47a12',
} as const;

export const ESTADOS_PANEL = [
  { clave: 'cerrados', singular: 'cerrado', plural: 'cerrados', etiqueta: 'Cerrados', filtro: 'CERRADO' },
  { clave: 'abiertos', singular: 'abierto', plural: 'abiertos', etiqueta: 'Abiertos', filtro: 'ABIERTO' },
  { clave: 'anulados', singular: 'anulado', plural: 'anulados', etiqueta: 'Anulados', filtro: 'ANULADO' },
] as const;

export const porcentaje = (parte: number, todo: number): number => (todo > 0 ? Math.round((parte / todo) * 100) : 0);

/** Último mes con datos: el actual si el año está en curso (según el `hoy` de la API) y diciembre si no. */
export function ultimoMes(anio: number, hoy: string): number {
  return anio === Number(hoy.slice(0, 4)) ? Number(hoy.slice(5, 7)) : 12;
}

/** Regla del prototipo para el eje Y: paso según el máximo y al menos tres marcas. */
export function ejeY(maximo: number): { ticks: number[]; tope: number } {
  const m = Math.max(1, maximo);
  const paso = m <= 5 ? 1 : m <= 10 ? 2 : m <= 25 ? 5 : 10;
  const tope = Math.max(paso * 3, Math.ceil(m / paso) * paso);
  return { ticks: Array.from({ length: tope / paso + 1 }, (_, i) => i * paso), tope };
}

/** "1 cerrado, 3 abiertos": solo los estados con ajustes. */
export function partesTexto(c: ConteoPorEstado): string {
  return ESTADOS_PANEL.filter((e) => c[e.clave] > 0)
    .map((e) => `${String(c[e.clave])} ${c[e.clave] === 1 ? e.singular : e.plural}`)
    .join(', ');
}

export const textoAjustes = (n: number): string => plural(n, 'ajuste', 'ajustes');

/** Índice del primer mes con el máximo de ajustes; -1 si no hay ninguno (no se rotula un cero). */
export function indiceMaximo(totales: number[]): number {
  const maximo = Math.max(0, ...totales);
  return maximo === 0 ? -1 : totales.indexOf(maximo);
}
