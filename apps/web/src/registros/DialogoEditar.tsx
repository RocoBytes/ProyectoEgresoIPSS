import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DetalleRegistro } from '@ipss/shared';
import { ErrorApi } from '../api/cliente';
import { Aviso } from '../comun/Aviso';
import { useToast } from '../comun/Toasts';
import { Boton } from '../comun/ui/Boton';
import { AreaTexto, Campo, Entrada } from '../comun/ui/Campo';
import { Dialogo } from '../comun/ui/Dialogo';
import { editarRegistro } from './api';

interface Valores {
  descripcion: string;
  fechaComprometida: string;
}

interface Props {
  registro: DetalleRegistro;
  abierto: boolean;
  alCerrar: () => void;
}

function Contenido({ registro, alCerrar }: Omit<Props, 'abierto'>) {
  const cliente = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, setError, formState } = useForm<Valores>({
    defaultValues: { descripcion: registro.descripcion, fechaComprometida: registro.fechaComprometida },
  });
  const guardar = useMutation({
    mutationFn: (v: Valores) => editarRegistro(registro.id, { descripcion: v.descripcion.trim(), fechaComprometida: v.fechaComprometida }),
    onSuccess: async (respuesta) => {
      toast(respuesta.sinCambios ? 'No había cambios que guardar.' : 'Cambios guardados. Quedaron en el historial.');
      await cliente.invalidateQueries({ queryKey: ['registros'] });
      alCerrar();
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.estado === 400) {
        const cuerpo = error.cuerpo as { errores?: Array<{ campo: string; mensaje: string }> } | undefined;
        for (const { campo, mensaje } of cuerpo?.errores ?? []) {
          if (campo === 'descripcion' || campo === 'fechaComprometida') setError(campo, { message: mensaje });
        }
      }
    },
  });
  const errorGeneral = guardar.error instanceof ErrorApi && guardar.error.estado !== 400 ? guardar.error.message : null;

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        void handleSubmit((v) => {
          guardar.mutate(v);
        })(e);
      }}
    >
      <p className="text-texto-2">
        El número, la carrera y la sesión de origen no cambian. Cada edición queda en el historial con el valor anterior.
      </p>
      <Campo id="m-descripcion" etiqueta="Descripción de lo observado" error={formState.errors.descripcion?.message}>
        <AreaTexto
          id="m-descripcion"
          error={formState.errors.descripcion?.message}
          {...register('descripcion', {
            validate: (v) => v.trim().length >= 20 || 'La descripción necesita al menos 20 caracteres.',
          })}
        />
      </Campo>
      <Campo id="m-comprometida" etiqueta="Fecha comprometida" className="max-w-60" error={formState.errors.fechaComprometida?.message}>
        <Entrada
          id="m-comprometida"
          type="date"
          min={registro.sesion.fecha}
          error={formState.errors.fechaComprometida?.message}
          {...register('fechaComprometida', {
            validate: (v) => (v === '' ? 'Indica la fecha comprometida.' : v < registro.sesion.fecha ? 'No puede ser anterior a la sesión.' : true),
          })}
        />
      </Campo>
      {errorGeneral !== null && (
        <Aviso tipo="error" rol="alert">
          {errorGeneral}
        </Aviso>
      )}
      <div className="flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando' : 'Guardar cambios'}
        </Boton>
      </div>
    </form>
  );
}

export function DialogoEditar({ registro, abierto, alCerrar }: Props) {
  return (
    <Dialogo abierto={abierto} titulo={`Editar el registro ${registro.correlativo}`} alCerrar={alCerrar}>
      <Contenido registro={registro} alCerrar={alCerrar} />
    </Dialogo>
  );
}
