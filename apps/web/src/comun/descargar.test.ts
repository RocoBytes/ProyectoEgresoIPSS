import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardarArchivo } from './descargar';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('guardarArchivo', () => {
  it('descarga con el nombre dado, quita el enlace y libera la URL solo después del clic', () => {
    const orden: string[] = [];
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn(() => orden.push('revocar')) });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      orden.push(`clic:${this.download}:${this.href}`);
    });
    guardarArchivo(new Blob(['x']), 'registros-2026.xlsx');
    expect(orden).toEqual(['clic:registros-2026.xlsx:blob:prueba']);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(orden).toEqual(['clic:registros-2026.xlsx:blob:prueba', 'revocar']);
  });
});
