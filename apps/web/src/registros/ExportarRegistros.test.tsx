import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilaRegistro } from '@ipss/shared';
import { guardarArchivo } from '../comun/descargar';
import { montar, respuestaJson, simularApi } from '../pruebas/ayudas';
import { PaginaRegistros } from './PaginaRegistros';

vi.mock('../comun/descargar', () => ({ guardarArchivo: vi.fn() }));

const fila = (n: number): FilaRegistro => ({
  id: `r${String(n)}`,
  correlativo: `R-2026-${String(n).padStart(3, '0')}`,
  sesion: { id: 's1', fecha: '2026-05-02' },
  carrera: { id: 'c1', nombre: 'Informática' },
  nivelImpacto: 'ASIGNATURA',
  objeto: 'Programación',
  canal: 'Comité',
  fechaComprometida: '2026-06-10',
  estado: 'ABIERTO',
  vencido: false,
});

const rutas = [{ path: '/registros', element: <PaginaRegistros /> }];

beforeEach(() => {
  vi.mocked(guardarArchivo).mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** `listado` es la URL (con su búsqueda) que la pantalla pedirá a la API para esa entrada. */
function preparar(entrada: string, listado: string, total: number, exportacion?: () => Response | Promise<Response>, urlExportacion = '/api/registros/exportar') {
  return {
    ...simularApi({
      'GET /api/catalogos': () =>
        respuestaJson(200, { sectores: [{ id: 's1', nombre: 'Tecnologías' }], carreras: [{ id: 'c1', nombre: 'Informática', sectorId: 's1' }], canales: [] }),
      'GET /api/registros/anios': () => respuestaJson(200, [2026]),
      [`GET ${listado}`]: () => respuestaJson(200, { filas: total === 0 ? [] : [fila(1)], total, pagina: 1, porPagina: 10 }),
      ...(exportacion !== undefined ? { [`GET ${urlExportacion}`]: exportacion } : {}),
    }),
    montado: montar(rutas, entrada),
  };
}

const xlsx = (nombre?: string) => () =>
  new Response(new Blob(['contenido']), {
    status: 200,
    headers: nombre === undefined ? {} : { 'Content-Disposition': `attachment; filename="${nombre}"` },
  });

/** Espera a que el listado cargue (el botón se habilita con el total) y devuelve el botón. */
const botonListo = () =>
  waitFor(() => {
    const b = screen.getByRole<HTMLButtonElement>('button', { name: 'Exportar a Excel' });
    expect(b.disabled).toBe(false);
    return b;
  });

describe('Exportar a Excel', () => {
  it('está deshabilitado cuando el listado no tiene filas', async () => {
    preparar('/registros', '/api/registros', 0);
    await screen.findByText('Ningún registro coincide');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Exportar a Excel' }).disabled).toBe(true);
  });

  it('pide el archivo con los filtros actuales traducidos y sin la página, y avisa con el toast', async () => {
    const api = preparar(
      '/registros?anio=2026&sector=s1&estado=VENCIDO&q=ab&pagina=2',
      '/api/registros?anio=2026&sectorId=s1&estado=VENCIDO&q=ab&pagina=2',
      12,
      xlsx('registros-2026.xlsx'),
      '/api/registros/exportar?anio=2026&sectorId=s1&estado=VENCIDO&q=ab',
    );
    fireEvent.click(await botonListo());
    expect(await screen.findByText('Se generó registros-2026.xlsx con 12 filas, las mismas del listado.')).toBeTruthy();
    expect(api.llamadas).toContain('GET /api/registros/exportar?anio=2026&sectorId=s1&estado=VENCIDO&q=ab');
    expect(vi.mocked(guardarArchivo)).toHaveBeenCalledOnce();
    expect(vi.mocked(guardarArchivo).mock.calls[0]?.[1]).toBe('registros-2026.xlsx');
  });

  it('usa el singular con una sola fila y el nombre que manda el servidor', async () => {
    preparar('/registros?anio=2025', '/api/registros?anio=2025', 1, xlsx('registros-2025.xlsx'), '/api/registros/exportar?anio=2025');
    fireEvent.click(await botonListo());
    expect(await screen.findByText('Se generó registros-2025.xlsx con 1 fila, las mismas del listado.')).toBeTruthy();
  });

  it.each([
    ['/registros?anio=2024', '/api/registros?anio=2024', '/api/registros/exportar?anio=2024', 'registros-2024.xlsx'],
    ['/registros', '/api/registros', '/api/registros/exportar', 'registros-todos.xlsx'],
  ])('sin Content-Disposition el nombre cae a registros-<año|todos> (%s)', async (entrada, listado, exportar, esperado) => {
    preparar(entrada, listado, 3, xlsx(), exportar);
    fireEvent.click(await botonListo());
    expect(await screen.findByText(`Se generó ${esperado} con 3 filas, las mismas del listado.`)).toBeTruthy();
    expect(vi.mocked(guardarArchivo).mock.calls[0]?.[1]).toBe(esperado);
  });

  it('mientras descarga queda ocupado y deshabilitado', async () => {
    let liberar: (r: Response) => void = () => undefined;
    preparar('/registros', '/api/registros', 5, () => new Promise<Response>((r) => { liberar = r; }));
    fireEvent.click(await botonListo());
    await waitFor(() => {
      const b = screen.getByRole('button', { name: 'Exportar a Excel' });
      expect(b.getAttribute('aria-busy')).toBe('true');
      expect(b.getAttribute('disabled')).not.toBeNull();
    });
    liberar(xlsx('registros-todos.xlsx')());
    await screen.findByText(/Se generó registros-todos.xlsx con 5 filas/);
    expect(screen.getByRole('button', { name: 'Exportar a Excel' }).getAttribute('aria-busy')).toBe('false');
  });

  it('un 400 de la API se muestra tal cual y no se guarda nada', async () => {
    preparar('/registros', '/api/registros', 5, () =>
      respuestaJson(400, { statusCode: 400, message: 'La exportación admite hasta 20.000 filas. Acota los filtros e inténtalo de nuevo.' }),
    );
    fireEvent.click(await botonListo());
    expect((await screen.findByRole('alert')).textContent).toContain('La exportación admite hasta 20.000 filas.');
    expect(vi.mocked(guardarArchivo)).not.toHaveBeenCalled();
    expect(screen.queryByText(/Se generó/)).toBeNull();
  });
});
