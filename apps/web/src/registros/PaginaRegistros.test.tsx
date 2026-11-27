import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilaRegistro } from '@ipss/shared';
import { montar, respuestaJson } from '../pruebas/ayudas';
import { PaginaRegistros } from './PaginaRegistros';

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
  vencido: n === 1,
});

/** Simula la API por ruta; guarda las URL de listado pedidas. */
function simular(total: number) {
  const pedidos: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: string) => {
      const url = new URL(entrada, 'http://x');
      if (url.pathname === '/api/catalogos')
        return Promise.resolve(
          respuestaJson(200, {
            sectores: [{ id: 's1', nombre: 'Tecnologías' }],
            carreras: [{ id: 'c1', nombre: 'Informática', sectorId: 's1' }],
            canales: [{ id: 'k1', nombre: 'Comité' }],
          }),
        );
      if (url.pathname === '/api/registros/anios') return Promise.resolve(respuestaJson(200, [2026, 2025]));
      if (url.pathname === '/api/catalogos/carreras/c1/objetos')
        return Promise.resolve(respuestaJson(200, { asignaturas: [{ id: 'a1', nombre: 'Programación' }], modulos: [], versionesMalla: [] }));
      if (url.pathname === '/api/registros') {
        pedidos.push(url.search);
        const pagina = Number(url.searchParams.get('pagina') ?? '1');
        const filas = total === 0 ? [] : Array.from({ length: Math.min(10, total - (pagina - 1) * 10) }, (_, i) => fila((pagina - 1) * 10 + i + 1));
        return Promise.resolve(respuestaJson(200, { filas, total, pagina, porPagina: 10 }));
      }
      return Promise.reject(new Error(`Llamada sin simular: ${entrada}`));
    }),
  );
  return pedidos;
}

const rutas = [
  { path: '/registros', element: <PaginaRegistros /> },
  { path: '/registros/:id', element: <p>Detalle abierto</p> },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PaginaRegistros', () => {
  it('lleva la URL a los filtros y a la API, y muestra chips que se quitan', async () => {
    const pedidos = simular(25);
    const { enrutador } = montar(rutas, '/registros?anio=2026&estado=VENCIDO&q=hola');
    expect(await screen.findByText('25 registros con los filtros aplicados')).toBeTruthy();
    expect(pedidos[0]).toContain('estado=VENCIDO');
    expect(pedidos[0]).toContain('q=hola');
    const chips = within(screen.getByRole('list', { name: 'Filtros aplicados' }));
    expect(chips.getByText('Año 2026')).toBeTruthy();
    expect(chips.getByText('Abierto y vencido')).toBeTruthy();
    expect(chips.getByText('Búsqueda: “hola”')).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>('Estado').value).toBe('VENCIDO');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el filtro Abierto y vencido' }));
    await waitFor(() => expect(enrutador.state.location.search).not.toContain('estado'));
    expect(enrutador.state.location.search).toContain('q=hola');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todos' }));
    await waitFor(() => expect(enrutador.state.location.search).toBe(''));
    expect(await screen.findByText('25 registros en total')).toBeTruthy();
  });

  it('cambiar un filtro actualiza la URL; el filtro de asignatura aparece con la carrera', async () => {
    simular(3);
    const { enrutador } = montar(rutas, '/registros');
    expect(await screen.findByText('3 registros en total')).toBeTruthy();
    expect(screen.queryByLabelText('Asignatura')).toBeNull();
    fireEvent.change(screen.getByLabelText('Carrera'), { target: { value: 'c1' } });
    expect(await screen.findByLabelText('Asignatura')).toBeTruthy();
    expect(enrutador.state.location.search).toContain('carrera=c1');
  });

  it('pagina de 10 en 10', async () => {
    simular(25);
    const { enrutador } = montar(rutas, '/registros');
    expect(await screen.findByText('Mostrando 1 a 10 de 25')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('Mostrando 11 a 20 de 25')).toBeTruthy();
    expect(enrutador.state.location.search).toContain('pagina=2');
    fireEvent.click(screen.getByRole('button', { name: 'Página 3' }));
    expect(await screen.findByText('Mostrando 21 a 25 de 25')).toBeTruthy();
  });

  it('sin resultados ofrece quitar los filtros', async () => {
    simular(0);
    montar(rutas, '/registros?q=nada');
    expect(await screen.findByText('Ningún registro coincide')).toBeTruthy();
    expect(screen.getByText('Prueba con otro año o quita algún filtro.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitar todos los filtros' })).toBeTruthy();
  });

  it('un clic en la fila abre el detalle', async () => {
    simular(2);
    const { enrutador } = montar(rutas, '/registros');
    fireEvent.click((await screen.findAllByText('Programación'))[0] as HTMLElement);
    await waitFor(() => expect(enrutador.state.location.pathname).toBe('/registros/r1'));
  });
});
