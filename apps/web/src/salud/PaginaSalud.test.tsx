import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { crearClienteConsultas } from '../clienteConsultas';
import { PaginaSalud } from './PaginaSalud';

function respuestaJson(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });
}

const verificadoEn = '2026-11-26T15:30:45.000Z';

function montar() {
  // Sin reintentos en pruebas para que el fallo de red se vea de inmediato.
  const cliente = crearClienteConsultas();
  cliente.setDefaultOptions({ queries: { retry: false } });
  render(
    <QueryClientProvider client={cliente}>
      <PaginaSalud />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PaginaSalud', () => {
  it('muestra API en línea y base conectada con un 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respuestaJson(200, { estado: 'ok', baseDeDatos: 'ok', verificadoEn }))),
    );
    montar();
    expect(screen.getByText('Verificando…')).toBeDefined();
    expect(await screen.findByText('En línea')).toBeDefined();
    expect(screen.getByText('Conectada')).toBeDefined();
    // 15:30:45 UTC es 12:30:45 en Santiago durante el horario de verano (UTC-3).
    expect(screen.getByText('Verificado a las 12:30:45')).toBeDefined();
  });

  it('muestra API en línea y base sin conexión con un 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(respuestaJson(503, { estado: 'error', baseDeDatos: 'sin_conexion', verificadoEn })),
      ),
    );
    montar();
    expect(await screen.findByText('En línea')).toBeDefined();
    expect(screen.getByText('Sin conexión')).toBeDefined();
  });

  it('muestra sin respuesta cuando falla la red', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    montar();
    expect(await screen.findByText('Sin respuesta')).toBeDefined();
    expect(screen.getByText('Sin conexión')).toBeDefined();
  });

  it('vuelve a consultar al pulsar "Volver a verificar"', async () => {
    const simulado = vi.fn(() =>
      Promise.resolve(respuestaJson(200, { estado: 'ok', baseDeDatos: 'ok', verificadoEn })),
    );
    vi.stubGlobal('fetch', simulado);
    montar();
    await screen.findByText('En línea');
    expect(simulado).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Volver a verificar' }));
    await waitFor(() => {
      expect(simulado).toHaveBeenCalledTimes(2);
    });
  });
});
