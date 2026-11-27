import { Navigate, Outlet, useLocation } from 'react-router';
import { ErrorApi } from '../api/cliente';
import { rutaDeIngreso, useExpiracionDeSesion, useSesion } from '../acceso/sesion';
import { EstructuraApp } from './EstructuraApp';

/** Deja pasar solo con sesión; mientras se comprueba muestra un indicador accesible. */
export function RutaProtegida() {
  const sesion = useSesion();
  const ubicacion = useLocation();
  useExpiracionDeSesion();

  if (sesion.isPending) {
    return (
      <div role="status" className="grid min-h-screen place-items-center gap-3 content-center">
        <span className="giro giro-oscuro" aria-hidden="true" />
        <span className="text-texto-2">Verificando tu sesión…</span>
      </div>
    );
  }

  if (sesion.isError) {
    if (sesion.error instanceof ErrorApi && sesion.error.estado === 401) {
      return <Navigate to={rutaDeIngreso(null, `${ubicacion.pathname}${ubicacion.search}`)} replace />;
    }
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-lg font-bold text-navy">No pudimos verificar tu sesión</h1>
        <p className="mt-2 text-texto-2">Revisa tu conexión e intenta de nuevo.</p>
        <button
          type="button"
          onClick={() => {
            void sesion.refetch();
          }}
          className="mt-4 inline-flex min-h-10 cursor-pointer items-center rounded-s border border-borde-fuerte bg-superficie px-4 font-semibold text-navy hover:border-navy"
        >
          Reintentar
        </button>
      </main>
    );
  }

  return (
    <EstructuraApp usuario={sesion.data}>
      <Outlet />
    </EstructuraApp>
  );
}
