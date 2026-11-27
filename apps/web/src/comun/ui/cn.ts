import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases condicionales y resuelve conflictos de Tailwind (gana la última). */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
