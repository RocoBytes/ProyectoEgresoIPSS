import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DetalleRegistro } from '@ipss/shared';
import { ErrorApi } from '../api/cliente';
import { Aviso } from '../comun/Aviso';
import { useToast } from '../comun/Toasts';
import { Boton } from '../comun/ui/Boton';
import { AreaTexto, Campo } from '../comun/ui/Campo';
import { Dialogo } from '../comun/ui/Dialogo';
import { anularRegistro } from './api';
import { traducirErrorApi } from '../comun/errores-api';

const MAXIMO_MOTIVO = 2000;

interface Valores {
  motivo: string;
}

interface Props {
  registro: DetalleRegistro;
  abierto: boolean;
  alCerrar: () => void;
}

function Contenido({ registro, alCerrar }: Omit<Props, 'abierto'>) {
  const cliente = useQueryClient();
  const toast = useToast();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<Valores>({ defaultValues: { motivo: '' } });

  const anular = useMutation({
    mutationFn: (v: Valores) => anularRegistro(registro.id, v.motivo.trim()),
    onSuccess: async () => {
      toast(`El registro ${registro.correlativo} quedó anulado.`);
      await Promise.all([cliente.invalidateQueries({ queryKey: ['registros'] }), cliente.invalidateQueries({ queryKey: ['reportes'] })]);
      alCerrar();
    },
    onError: (error) => {
      const { campos, general } = traducirErrorApi(error);
      const { motivo, ...sobrantes } = campos;
      if (motivo !== undefined) setError('motivo', { message: motivo });
      const resto = Object.values(sobrantes);
      setErrorGeneral(general ?? (resto.length > 0 ? resto.join(' ') : null));
      // Un 409 significa que otro usuario ya cambió el registro: se refresca para que la pantalla lo refleje.
      if (error instanceof ErrorApi && error.estado === 409) void cliente.invalidateQueries({ queryKey: ['registros'] });
    },
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        setErrorGeneral(null);
        void handleSubmit((v) => {
          anular.mutate(v);
        })(e);
      }}
    >
      <p className="text-texto-2">
        La anulación es para registros ingresados por error o duplicados. El registro, su evidencia y su historial se conservan.
      </p>
      <Campo id="m-motivo" etiqueta="Motivo de la anulación" error={formState.errors.motivo?.message}>
        <AreaTexto
          id="m-motivo"
          error={formState.errors.motivo?.message}
          {...register('motivo', {
            validate: (v) =>
              v.trim().length < 10 ? 'Explica el motivo con al menos 10 caracteres.' : v.trim().length > MAXIMO_MOTIVO ? 'El motivo admite hasta 2.000 caracteres.' : true,
          })}
        />
      </Campo>
      <Aviso tipo="alerta">La anulación no se puede deshacer.</Aviso>
      {errorGeneral !== null && (
        <Aviso tipo="error" rol="alert">
          {errorGeneral}
        </Aviso>
      )}
      <div className="flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="peligro" disabled={anular.isPending}>
          {anular.isPending ? 'Anulando' : 'Anular registro'}
        </Boton>
      </div>
    </form>
  );
}

export function DialogoAnular({ registro, abierto, alCerrar }: Props) {
  return (
    <Dialogo abierto={abierto} titulo={`Anular el registro ${registro.correlativo}`} alCerrar={alCerrar}>
      <Contenido registro={registro} alCerrar={alCerrar} />
    </Dialogo>
  );
}
