/**
 * `volver` viene de la URL, así que cualquiera puede escribirlo. Solo se acepta una ruta
 * de esta misma aplicación: `//host` y `/\host` los navegadores los tratan como otro sitio.
 */
export function destinoSeguro(volver: string | null): string {
  if (volver === null) return '/';
  const esRutaLocal = volver.startsWith('/') && !volver.startsWith('//') && !volver.includes('\\');
  // eslint-disable-next-line no-control-regex -- los caracteres de control no tienen cabida en una ruta
  const tieneControl = /[\u0000-\u001f]/.test(volver);
  if (!esRutaLocal || tieneControl) return '/';
  // Volver a la pantalla de ingreso después de ingresar sería un ciclo.
  if (volver === '/ingresar' || volver.startsWith('/ingresar?')) return '/';
  return volver;
}
