import { Link, useRouteError } from 'react-router';

export function ErrorDeRuta() {
  const error = useRouteError();
  // El detalle técnico va a la consola; al usuario solo se le muestra un mensaje claro.
  console.error(error);
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-bold text-navy">Algo salió mal</h1>
      <p className="mt-2 text-texto-2">
        No pudimos mostrar esta pantalla. Intente nuevamente o vuelva al inicio.
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-10 items-center rounded-s border border-borde-fuerte bg-superficie px-4 font-semibold text-navy hover:border-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
