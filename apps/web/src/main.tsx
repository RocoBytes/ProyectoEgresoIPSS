import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { crearClienteConsultas } from './clienteConsultas';
import { ProveedorToasts } from './comun/Toasts';
import { rutasApp } from './rutas';
import './index.css';

const clienteConsultas = crearClienteConsultas();
const enrutador = createBrowserRouter(rutasApp);

const raiz = document.getElementById('root');
if (raiz === null) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <ProveedorToasts>
        <RouterProvider router={enrutador} />
      </ProveedorToasts>
    </QueryClientProvider>
  </StrictMode>,
);
