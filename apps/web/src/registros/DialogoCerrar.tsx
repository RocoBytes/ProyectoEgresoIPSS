import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DetalleRegistro } from '@ipss/shared';
import { ErrorApi } from '../api/cliente';
import { validarArchivo } from '../comun/archivos';
import { Aviso } from '../comun/Aviso';
import { fechaTexto, hoyEnSantiago } from '../comun/fecha-texto';
import { FilaArchivo } from '../comun/FilaArchivo';
import { useToast } from '../comun/Toasts';
import { Boton } from '../comun/ui/Boton';
import { AreaTexto, Campo, Entrada } from '../comun/ui/Campo';
import { Dialogo } from '../comun/ui/Dialogo';
import { ZonaArchivo } from '../comun/ZonaArchivo';
import { cerrarRegistro } from './api';
import { traducirErrorApi } from '../comun/errores-api';

const MAXIMO_COMENTARIO = 2000;
const MENSAJE_COMENTARIO = 'El comentario admite hasta 2.000 caracteres.';
const MENSAJE_SIN_ARCHIVO = 'Adjunta la evidencia. Sin ella el registro no se puede cerrar.';

interface Valores {
  fechaEfectiva: string;
  comentario: string;
}

interface Props {
  registro: DetalleRegistro;
  abierto: boolean;
  alCerrar: () => void;
}

function Contenido({ registro, alCerrar }: Omit<Props, 'abierto'>) {
  const cliente = useQueryClient();
  const toast = useToast();
  // Se fija al abrir: el máximo del campo y la validación usan el mismo "hoy".
  const [hoy] = useState(hoyEnSantiago);
  const sesion = registro.sesion.fecha;
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<Valores>({ defaultValues: { fechaEfectiva: hoy, comentario: '' } });

  const cerrar = useMutation({
    mutationFn: (v: Valores) => {
      if (archivo === null) throw new Error('Falta la evidencia');
      const comentario = v.comentario.trim();
      return cerrarRegistro(registro.id, { fechaEfectiva: v.fechaEfectiva, ...(comentario !== '' ? { comentario } : {}) }, archivo);
    },
    onSuccess: async () => {
      toast(`El registro ${registro.correlativo} quedó cerrado.`);
      await Promise.all([cliente.invalidateQueries({ queryKey: ['registros'] }), cliente.invalidateQueries({ queryKey: ['reportes'] })]);
      alCerrar();
    },
    onError: (error) => {
      const { campos, general } = traducirErrorApi(error);
      const sobrantes: string[] = [];
      for (const [campo, mensaje] of Object.entries(campos)) {
        if (campo === 'fechaEfectiva' || campo === 'comentario') setError(campo, { message: mensaje });
        else if (campo === 'evidencia') setErrorArchivo(mensaje);
        else sobrantes.push(mensaje);
      }
      setErrorGeneral(general ?? (sobrantes.length > 0 ? sobrantes.join(' ') : null));
      // Un 409 significa que otro usuario ya cambió el registro: se refresca para que la pantalla lo refleje.
      if (error instanceof ErrorApi && error.estado === 409) void cliente.invalidateQueries({ queryKey: ['registros'] });
    },
  });

  const recibir = (archivos: File[]) => {
    const elegido = archivos[0];
    if (elegido === undefined) return;
    const mensaje = validarArchivo(elegido.name, elegido.size, 'cierre');
    setErrorArchivo(mensaje);
    if (mensaje === null) setArchivo(elegido);
  };

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        setErrorGeneral(null);
        if (archivo === null) setErrorArchivo(MENSAJE_SIN_ARCHIVO);
        void handleSubmit((v) => {
          if (archivo !== null) cerrar.mutate(v);
        })(e);
      }}
    >
      <p className="text-texto-2">
        Indica cuándo se hizo efectivo el cambio y adjunta el documento que lo respalda: la malla publicada, el programa actualizado o la resolución.
      </p>
      <Campo id="m-efectiva" etiqueta="Fecha efectiva del cambio" className="max-w-60" error={formState.errors.fechaEfectiva?.message}>
        <Entrada
          id="m-efectiva"
          type="date"
          min={sesion}
          max={hoy}
          error={formState.errors.fechaEfectiva?.message}
          {...register('fechaEfectiva', {
            validate: (v) =>
              v === ''
                ? 'Indica la fecha en que el cambio se hizo efectivo.'
                : v > hoy
                  ? 'La fecha efectiva no puede ser posterior a hoy.'
                  : v < sesion
                    ? `La fecha efectiva no puede ser anterior a la sesión (${fechaTexto(sesion)}).`
                    : true,
          })}
        />
      </Campo>
      <div className="grid gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Evidencia de cierre</span>
        {archivo !== null ? (
          <ul className="grid gap-1.5">
            <FilaArchivo
              archivo={archivo}
              {...(errorArchivo !== null ? { error: errorArchivo } : {})}
              alQuitar={() => {
                setArchivo(null);
                setErrorArchivo(null);
              }}
            />
          </ul>
        ) : (
          <>
            <ZonaArchivo
              id="m-evidencia"
              etiqueta="Evidencia de cierre"
              texto="Arrastra el archivo aquí o"
              ayuda="PDF, JPG o PNG de hasta 20 MB."
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              alRecibir={recibir}
            />
            {errorArchivo !== null && <p className="text-[12.5px] font-medium text-error">{errorArchivo}</p>}
          </>
        )}
      </div>
      <Campo
        id="m-comentario"
        etiqueta={
          <>
            Comentario <span className="font-normal text-texto-2">(opcional)</span>
          </>
        }
        error={formState.errors.comentario?.message}
      >
        <AreaTexto
          id="m-comentario"
          error={formState.errors.comentario?.message}
          {...register('comentario', { validate: (v) => v.trim().length <= MAXIMO_COMENTARIO || MENSAJE_COMENTARIO })}
        />
      </Campo>
      <Aviso tipo="alerta">Un registro cerrado ya no se puede editar ni anular.</Aviso>
      {errorGeneral !== null && (
        <Aviso tipo="error" rol="alert">
          {errorGeneral}
        </Aviso>
      )}
      <div className="flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={cerrar.isPending}>
          {cerrar.isPending ? 'Cerrando' : 'Cerrar registro'}
        </Boton>
      </div>
    </form>
  );
}

export function DialogoCerrar({ registro, abierto, alCerrar }: Props) {
  return (
    <Dialogo abierto={abierto} titulo={`Cerrar el registro ${registro.correlativo}`} alCerrar={alCerrar}>
      <Contenido registro={registro} alCerrar={alCerrar} />
    </Dialogo>
  );
}
