import { tamanoTexto } from '../comun/tamano';

export type DestinoArchivo = 'acta' | 'foto';
export const MAXIMO_BYTES = 20 * 1024 * 1024;

/** Revisión rápida por extensión y peso; la API revisa el contenido real. Devuelve el mensaje o `null`. */
export function validarArchivo(nombre: string, tamano: number, destino: DestinoArchivo): string | null {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase();
  if (destino === 'acta' && ext !== 'pdf') return `“${nombre}” no es un PDF. El acta debe adjuntarse en PDF.`;
  if (destino === 'foto' && !['jpg', 'jpeg', 'png'].includes(ext)) {
    const heic = ext === 'heic' || ext === 'heif' ? ' Las fotos HEIC del iPhone hay que convertirlas a JPG antes de subirlas.' : '';
    return `“${nombre}” no es JPG ni PNG.${heic}`;
  }
  if (tamano > MAXIMO_BYTES) return `“${nombre}” pesa ${tamanoTexto(tamano)} y el máximo es 20 MB. Reduce el archivo o divídelo.`;
  return null;
}
