import { Link } from 'react-router';
import { EnConstruccion } from './EnConstruccion';

export function PaginaNoEncontrada() {
  return (
    <EnConstruccion titulo="Página no encontrada">
      <p className="text-texto-2">
        La dirección que abriste no existe.{' '}
        <Link to="/" className="font-semibold text-azul-osc underline underline-offset-[3px]">
          Volver al panel
        </Link>
      </p>
    </EnConstruccion>
  );
}
