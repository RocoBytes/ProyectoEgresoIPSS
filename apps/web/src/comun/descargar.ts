const REVOCAR_TRAS_MS = 10_000;

/** Entrega un archivo ya descargado al navegador con el nombre dado. */
export function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Algunos navegadores arrancan la descarga de forma asíncrona: liberar la URL en el mismo turno puede cancelarla.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOCAR_TRAS_MS);
}
