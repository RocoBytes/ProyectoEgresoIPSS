import { useQuery } from '@tanstack/react-query';
import { obtenerSalud } from '../api/cliente';
import { TarjetaSalud } from './TarjetaSalud';

/** Contenedor: obtiene los datos y los entrega a la tarjeta, que solo dibuja. */
export function PaginaSalud() {
  const consulta = useQuery({ queryKey: ['salud'], queryFn: obtenerSalud });

  return (
    <TarjetaSalud
      cargando={consulta.isFetching}
      respuesta={consulta.data}
      sinRespuesta={consulta.isError}
      alVolverAVerificar={() => {
        void consulta.refetch();
      }}
    />
  );
}
