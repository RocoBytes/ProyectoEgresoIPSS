import { tamanoTexto } from './tamano';

export type DestinoArchivo = 'acta' | 'foto' | 'cierre';
export const MAXIMO_BYTES = 20 * 1024 * 1024;
export const MENSAJE_ARCHIVO_GRANDE = 'El archivo pesa más de 20 MB. Reduce el archivo o divídelo.';
export const MENSAJE_HEIC = 'Las fotos HEIC del iPhone hay que convertirlas a JPG antes de subirlas.';

/** Revisión rápida por extensión y peso; la API revisa el contenido real. Devuelve el mensaje o `null`. */
export function validarArchivo(nombre: string, tamano: number, destino: DestinoArchivo): string | null {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase();
  const esHeic = ext === 'heic' || ext === 'heif';
  if (destino === 'acta' && ext !== 'pdf') return `“${nombre}” no es un PDF. El acta debe adjuntarse en PDF.`;
  if (destino === 'foto' && !['jpg', 'jpeg', 'png'].includes(ext)) {
    return `“${nombre}” no es JPG ni PNG.${esHeic ? ` ${MENSAJE_HEIC}` : ''}`;
  }
  if (destino === 'cierre' && !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
    return esHeic ? MENSAJE_HEIC : `“${nombre}” no se puede usar como evidencia. Adjunta un PDF, JPG o PNG.`;
  }
  if (tamano > MAXIMO_BYTES) return `“${nombre}” pesa ${tamanoTexto(tamano)} y el máximo es 20 MB. Reduce el archivo o divídelo.`;
  return null;
}
