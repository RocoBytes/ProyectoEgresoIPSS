import { QueryClient } from '@tanstack/react-query';
import { debeReintentar } from './api/reintentos';

export function crearClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: debeReintentar, refetchOnWindowFocus: false } },
  });
}
