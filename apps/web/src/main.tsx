import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { crearClienteConsultas } from './clienteConsultas';
import { enrutador } from './rutas';
import './index.css';

const clienteConsultas = crearClienteConsultas();

const raiz = document.getElementById('root');
if (raiz === null) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <RouterProvider router={enrutador} />
    </QueryClientProvider>
  </StrictMode>,
);
