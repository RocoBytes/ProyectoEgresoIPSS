import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { EstadoRegistro } from '@ipss/shared';
import './index.css';

// Marcador temporal: las rutas y pantallas reales llegan en puntos de control
// posteriores. El import de tipos comprueba que el paquete compartido resuelve.
const estadoInicial: EstadoRegistro = 'ABIERTO';

const raiz = document.getElementById('root');
if (raiz === null) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(raiz).render(
  <StrictMode>
    <p>Plataforma de validación del perfil de egreso (estado de ejemplo: {estadoInicial})</p>
  </StrictMode>,
);
