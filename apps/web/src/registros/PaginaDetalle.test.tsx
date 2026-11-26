import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetalleRegistro } from '@ipss/shared';
import { montar, respuestaJson, simularApi } from '../pruebas/ayudas';
import { PaginaDetalle } from './PaginaDetalle';
import { detalleBase } from './trazabilidad.test';

const rutas = [{ path: '/registros/:id', element: <PaginaDetalle /> }];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 13, 15)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const cargar = (d: DetalleRegistro, extra: Record<string, () => Response> = {}) =>
  simularApi({ 'GET /api/registros/r1': () => respuestaJson(200, d), ...extra });

describe('PaginaDetalle', () => {
  it('muestra la trazabilidad de un registro vencido y el historial', async () => {
    cargar(
      detalleBase({
        vencido: true,
        historial: [
          { tipo: 'CREACION', fecha: '2026-05-02T15:00:00Z', usuario: 'Paula Rojas' },
          { tipo: 'EDICION', fecha: '2026-05-03T15:00:00Z', usuario: 'Paula Rojas', cambios: { descripcion: { antes: 'Antes', despues: 'Ahora' } } },
        ],
      }),
    );
    montar(rutas, '/registros/r1');
    expect(await screen.findByRole('heading', { name: 'Informática' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Trazabilidad del registro' })).toBeTruthy();
    expect(screen.getByText('vencido hace 3 días')).toBeTruthy();
    expect(screen.getByText('Vencido')).toBeTruthy();
    expect(screen.getByText('Registro creado en estado abierto.')).toBeTruthy();
    expect(screen.getByText('Cambió la descripción (antes: “Antes”).')).toBeTruthy();
    expect(screen.getByText('Esta sesión tiene un solo registro.')).toBeTruthy();
  });

  it('un registro cerrado muestra su sello y que se cumplió en plazo', async () => {
    cargar(detalleBase({ estado: 'CERRADO', fechaEfectiva: '2026-06-10' }));
    montar(rutas, '/registros/r1');
    expect(await screen.findByText('Cerrado · 10-06-2026')).toBeTruthy();
    expect(screen.getByText('cumplido en plazo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('Editar solo aparece con permiso; sin él se muestra Solo consulta', async () => {
    cargar(detalleBase({ permisos: { puedeModificar: false, motivoConsulta: 'Fuera de tu alcance.' } }));
    montar(rutas, '/registros/r1');
    expect(await screen.findByText('Solo consulta')).toBeTruthy();
    expect(screen.getByText('Fuera de tu alcance.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });

  it.each([
    [false, 'Cambios guardados. Quedaron en el historial.'],
    [true, 'No había cambios que guardar.'],
  ])('editar (sinCambios=%s) avisa con un toast', async (sinCambios, texto) => {
    const api = cargar(detalleBase(), { 'PATCH /api/registros/r1': () => respuestaJson(200, { sinCambios }) });
    montar(rutas, '/registros/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog', { name: 'Editar el registro R-2026-001' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Descripción de lo observado'), { target: { value: 'Una descripción nueva y suficientemente larga.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(texto)).toBeTruthy();
    await waitFor(() => expect(api.llamadas).toContain('PATCH /api/registros/r1'));
  });

  it('valida la descripción y la fecha antes de enviar', async () => {
    const api = cargar(detalleBase());
    montar(rutas, '/registros/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Descripción de lo observado'), { target: { value: 'corta' } });
    fireEvent.change(screen.getByLabelText('Fecha comprometida'), { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('La descripción necesita al menos 20 caracteres.')).toBeTruthy();
    expect(screen.getByText('No puede ser anterior a la sesión.')).toBeTruthy();
    expect(api.llamadas).not.toContain('PATCH /api/registros/r1');
  });

  it('un registro inexistente ofrece volver al listado', async () => {
    simularApi({ 'GET /api/registros/r1': () => respuestaJson(404, { message: 'No existe' }) });
    montar(rutas, '/registros/r1');
    expect(await screen.findByText('No encontramos ese registro')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver al listado' })).toBeTruthy();
  });
});
