import { createBrowserRouter } from 'react-router';
import { ErrorDeRuta } from './comun/ErrorDeRuta';
import { PaginaSalud } from './salud/PaginaSalud';

export const enrutador = createBrowserRouter([
  { path: '/', element: <PaginaSalud />, errorElement: <ErrorDeRuta /> },
]);
