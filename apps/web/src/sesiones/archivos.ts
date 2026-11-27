// Tope del envío completo. Caddy (413 sin cuerpo) y Cloudflare (su propia página de error) rechazan
// por Content-Length sin llegar a la API, así que la pantalla avisa antes de enviar. Decimal a propósito, como el tope
// de la API (100.000.000 de bytes): no se muestra ninguna cifra en MB para no mezclar 1024² con 10⁶.
export const MAXIMO_BYTES_ENVIO = 100 * 1000 * 1000;
export const MENSAJE_ENVIO_GRANDE = 'El envío supera los 100 MB en total. Adjunta menos fotos o reduce su tamaño.';
// Margen por parte del multipart (cabeceras y separador) para estimar por exceso, no por defecto.
const MARGEN_POR_PARTE = 1024;

/** Estimación conservadora del cuerpo multipart: pesos de los archivos, el JSON de `datos` y un margen por parte. */
export function envioExcedeElTope(acta: File, fotos: File[], datosJson: string): boolean {
  const archivos = [acta, ...fotos];
  const partes = archivos.length + 1;
  const estimado = archivos.reduce((suma, f) => suma + f.size, 0) + new TextEncoder().encode(datosJson).length + partes * MARGEN_POR_PARTE;
  return estimado > MAXIMO_BYTES_ENVIO;
}
