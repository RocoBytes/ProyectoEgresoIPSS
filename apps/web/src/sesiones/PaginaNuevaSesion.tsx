import { useSesion } from '../acceso/sesion';
import { Aviso } from '../comun/Aviso';
import { EnConstruccion } from '../comun/EnConstruccion';

export function PaginaNuevaSesion() {
  const { data: usuario } = useSesion();
  // Se respeta el permiso aunque alguien escriba la URL a mano; la API es la que lo hace cumplir de verdad.
  if (usuario?.puedeCrear === false) {
    return (
      <EnConstruccion titulo="Nueva sesión">
        <Aviso tipo="neutro" titulo="Solo consulta">
          Tu perfil es de consulta: puedes revisar y descargar las sesiones, pero no modificar.
        </Aviso>
      </EnConstruccion>
    );
  }
  return <EnConstruccion titulo="Nueva sesión" />;
}
