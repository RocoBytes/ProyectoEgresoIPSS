import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import type { Rol, UsuarioActual } from '@ipss/shared';
import { crearClienteConsultas } from '../clienteConsultas';
import { ProveedorToasts } from '../comun/Toasts';

export function respuestaJson(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function sinContenido(estado = 204): Response {
  return new Response(null, { status: estado });
}

export const usuarios: Record<Rol, UsuarioActual> = {
  DIRECTOR_SECTORIAL: {
    id: '1',
    nombre: 'Paula Rojas',
    correo: 'paula.rojas@instituto.example',
    rol: 'DIRECTOR_SECTORIAL',
    etiquetaRol: 'Dirección Sectorial',
    alcance: { descripcion: 'Tecnologías e Ingeniería', sectores: [], carreras: [] },
    puedeCrear: true,
  },
  DIRECTOR_CARRERA: {
    id: '2',
    nombre: 'Diego Muñoz',
    correo: 'diego.munoz@instituto.example',
    rol: 'DIRECTOR_CARRERA',
    etiquetaRol: 'Dirección de Carrera',
    alcance: { descripcion: 'Ingeniería en Informática', sectores: [], carreras: [] },
    puedeCrear: true,
  },
  ASEGURAMIENTO_CALIDAD: {
    id: '3',
    nombre: 'Marta Soto',
    correo: 'marta.soto@instituto.example',
    rol: 'ASEGURAMIENTO_CALIDAD',
    etiquetaRol: 'Aseguramiento de la Calidad',
    alcance: { descripcion: 'Todas las carreras (solo consulta)', sectores: [], carreras: [] },
    puedeCrear: false,
  },
};

type Manejador = (cuerpo: unknown) => Response | Promise<Response>;

/**
 * Sustituye `fetch` por manejadores por "MÉTODO /ruta". Una ruta sin manejador falla la prueba
 * en vez de salir a la red. Devuelve la lista de llamadas hechas, en orden.
 */
export function simularApi(manejadores: Record<string, Manejador>): { llamadas: string[]; cuerpos: unknown[] } {
  const registro = { llamadas: [] as string[], cuerpos: [] as unknown[] };
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      const ruta = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const clave = `${metodo} ${ruta}`;
      // Un multipart llega como FormData: la prueba lo inspecciona directamente.
      const cuerpo: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body instanceof FormData ? init.body : undefined;
      registro.llamadas.push(clave);
      registro.cuerpos.push(cuerpo);
      const manejador = manejadores[clave];
      if (manejador === undefined) return Promise.reject(new Error(`Llamada sin simular: ${clave}`));
      return Promise.resolve(manejador(cuerpo));
    }),
  );
  return registro;
}

export function montar(rutas: RouteObject[], entrada: string) {
  const cliente = crearClienteConsultas();
  // Sin reintentos en pruebas para que los fallos se vean de inmediato.
  cliente.setDefaultOptions({ queries: { retry: false } });
  const enrutador = createMemoryRouter(rutas, { initialEntries: [entrada] });
  render(
    <QueryClientProvider client={cliente}>
      <ProveedorToasts>
        <RouterProvider router={enrutador} />
      </ProveedorToasts>
    </QueryClientProvider>,
  );
  return { enrutador, cliente };
}
