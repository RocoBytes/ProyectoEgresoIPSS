import type { RouteObject } from 'react-router';
import { PaginaIngreso } from './acceso/PaginaIngreso';
import { ErrorDeRuta } from './comun/ErrorDeRuta';
import { PaginaNoEncontrada } from './comun/PaginaNoEncontrada';
import { RutaProtegida } from './comun/RutaProtegida';
import { PaginaMallas } from './mallas/PaginaMallas';
import { PaginaPanel } from './panel/PaginaPanel';
import { PaginaDetalle } from './registros/PaginaDetalle';
import { PaginaRegistros } from './registros/PaginaRegistros';
import { PaginaSalud } from './salud/PaginaSalud';
import { PaginaNuevaSesion } from './sesiones/PaginaNuevaSesion';

const errorElement = <ErrorDeRuta />;

/** Definición de rutas; main.tsx crea el enrutador y las pruebas pueden usar una memoria. */
export const rutasApp: RouteObject[] = [
  { path: '/ingresar', element: <PaginaIngreso />, errorElement },
  { path: '/estado', element: <PaginaSalud />, errorElement },
  {
    element: <RutaProtegida />,
    errorElement,
    children: [
      { index: true, element: <PaginaPanel />, errorElement },
      { path: 'sesiones/nueva', element: <PaginaNuevaSesion />, errorElement },
      { path: 'registros', element: <PaginaRegistros />, errorElement },
      { path: 'registros/:id', element: <PaginaDetalle />, errorElement },
      { path: 'mallas', element: <PaginaMallas />, errorElement },
      { path: '*', element: <PaginaNoEncontrada />, errorElement },
    ],
  },
];
