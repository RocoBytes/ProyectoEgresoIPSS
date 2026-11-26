import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Rol } from '@ipss/shared';
import { montar, respuestaJson, simularApi, sinContenido, usuarios } from '../pruebas/ayudas';
import { rutasApp } from '../rutas';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function conSesion(rol: Rol) {
  return simularApi({
    'GET /api/acceso/yo': () => respuestaJson(200, usuarios[rol]),
    'POST /api/acceso/salir': () => sinContenido(),
    'POST /api/acceso/renovar': () => sinContenido(),
  });
}

describe('RutaProtegida', () => {
  it('sin sesión lleva a /ingresar recordando la ruta pedida', async () => {
    simularApi({
      'GET /api/acceso/yo': () => respuestaJson(401, { message: 'Sesión no válida' }),
      'POST /api/acceso/renovar': () => respuestaJson(401, { message: 'Sesión no válida' }),
    });
    const { enrutador } = montar(rutasApp, '/registros?estado=abierto');
    await screen.findByRole('heading', { name: 'Inicia sesión' });
    expect(enrutador.state.location.pathname).toBe('/ingresar');
    expect(new URLSearchParams(enrutador.state.location.search).get('volver')).toBe('/registros?estado=abierto');
  });

  it('mientras comprueba la sesión muestra un indicador accesible', () => {
    simularApi({ 'GET /api/acceso/yo': () => new Promise<Response>(() => undefined) });
    montar(rutasApp, '/');
    expect(screen.getByRole('status').textContent).toContain('Verificando tu sesión');
  });

  it('con sesión muestra la estructura y el contenido de la ruta', async () => {
    conSesion('DIRECTOR_SECTORIAL');
    montar(rutasApp, '/registros');
    expect(await screen.findByRole('heading', { name: 'Registros' })).toBeDefined();
    expect(screen.getByText('En construcción: llega en el próximo hito.')).toBeDefined();
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Registros');
  });

  it('la ruta /estado sigue siendo pública', async () => {
    simularApi({
      'GET /api/salud': () => respuestaJson(200, { estado: 'ok', baseDeDatos: 'ok', verificadoEn: '2026-11-26T15:30:45.000Z' }),
    });
    montar(rutasApp, '/estado');
    expect(await screen.findByText('En línea')).toBeDefined();
  });
});

describe('Estructura de la aplicación', () => {
  it.each([
    ['DIRECTOR_SECTORIAL', true],
    ['DIRECTOR_CARRERA', true],
    ['ASEGURAMIENTO_CALIDAD', false],
  ] as const)('%s: "Nueva sesión" visible = %s', async (rol, visible) => {
    conSesion(rol);
    montar(rutasApp, '/');
    await screen.findByRole('heading', { name: 'Panel' });
    expect(screen.queryByRole('link', { name: 'Nueva sesión' }) !== null).toBe(visible);
    expect(screen.getByRole('link', { name: 'Registros' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Mallas' })).toBeDefined();
  });

  it('Aseguramiento de la Calidad ve el mensaje de consulta en /sesiones/nueva', async () => {
    conSesion('ASEGURAMIENTO_CALIDAD');
    montar(rutasApp, '/sesiones/nueva');
    expect(
      await screen.findByText('Tu perfil es de consulta: puedes revisar y descargar las sesiones, pero no modificar.'),
    ).toBeDefined();
  });

  it('el menú de usuario muestra cuenta, perfil y alcance, y se cierra con Escape devolviendo el foco', async () => {
    conSesion('DIRECTOR_CARRERA');
    montar(rutasApp, '/');
    const boton = await screen.findByRole('button', { name: 'Cuenta de Diego Muñoz' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('group', { name: 'Datos de la cuenta' });
    expect(menu.textContent).toContain('diego.munoz@instituto.example');
    expect(menu.textContent).toContain('Dirección de Carrera');
    expect(menu.textContent).toContain('Ingeniería en Informática');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar sesión' }));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Datos de la cuenta' })).toBeNull();
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(boton);
  });

  it('"Cerrar sesión" llama a salir y lleva a /ingresar?motivo=salida', async () => {
    const api = conSesion('DIRECTOR_SECTORIAL');
    const { enrutador } = montar(rutasApp, '/mallas');
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de Paula Rojas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Inicia sesión' });
    expect(api.llamadas).toContain('POST /api/acceso/salir');
    expect(enrutador.state.location.pathname + enrutador.state.location.search).toBe('/ingresar?motivo=salida');
    expect(screen.getByRole('status').textContent).toContain('Cerraste sesión');
  });

  it('tras 15 minutos sin interacción cierra la sesión y lleva a /ingresar con motivo=expirada', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = conSesion('DIRECTOR_SECTORIAL');
    const { enrutador } = montar(rutasApp, '/registros');
    await screen.findByRole('heading', { name: 'Registros' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60_000 + 60_000);
    });
    await waitFor(() => {
      expect(enrutador.state.location.pathname).toBe('/ingresar');
    });
    const parametros = new URLSearchParams(enrutador.state.location.search);
    expect(parametros.get('motivo')).toBe('expirada');
    expect(parametros.get('volver')).toBe('/registros');
    expect(api.llamadas).toContain('POST /api/acceso/salir');
    expect((await screen.findByRole('status')).textContent).toContain('Tu sesión expiró por inactividad');
  });

  it('si la sesión no se puede recuperar en una petición, vuelve al ingreso con motivo=expirada', async () => {
    conSesion('DIRECTOR_SECTORIAL');
    const { enrutador } = montar(rutasApp, '/mallas');
    await screen.findByRole('heading', { name: 'Mallas' });
    const { solicitarJson } = await import('../api/cliente');
    simularApi({
      'GET /api/mallas': () => respuestaJson(401, {}),
      'POST /api/acceso/renovar': () => respuestaJson(401, {}),
    });
    await solicitarJson('/api/mallas').catch(() => undefined);
    await waitFor(() => {
      expect(enrutador.state.location.pathname).toBe('/ingresar');
    });
    expect(enrutador.state.location.search).toContain('motivo=expirada');
    expect(enrutador.state.location.search).toContain('volver=%2Fmallas');
  });
});
