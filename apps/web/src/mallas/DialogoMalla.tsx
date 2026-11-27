import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VersionMallaListada } from '@ipss/shared';
import { validarArchivo } from '../comun/archivos';
import { Aviso } from '../comun/Aviso';
import { traducirErrorApi } from '../comun/errores-api';
import { hoyEnSantiago } from '../comun/fecha-texto';
import { FilaArchivo } from '../comun/FilaArchivo';
import { useToast } from '../comun/Toasts';
import { Boton } from '../comun/ui/Boton';
import { Campo, Entrada } from '../comun/ui/Campo';
import { Dialogo } from '../comun/ui/Dialogo';
import { ZonaArchivo } from '../comun/ZonaArchivo';
import { subirMalla } from './api';

interface Valores {
  anio: string;
  vigenteDesde: string;
}

interface Props {
  carreraId: string;
  carreraNombre: string;
  /** Versiones ya cargadas, para avisar de un año repetido antes de enviar. */
  versiones: VersionMallaListada[];
  abierto: boolean;
  alCerrar: () => void;
}

function Contenido({ carreraId, carreraNombre, versiones, alCerrar }: Omit<Props, 'abierto'>) {
  const cliente = useQueryClient();
  const toast = useToast();
  const anioActual = Number(hoyEnSantiago().slice(0, 4));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<Valores>({ defaultValues: { anio: String(anioActual), vigenteDesde: '' } });

  const subir = useMutation({
    mutationFn: (v: Valores) => {
      if (archivo === null) throw new Error('Falta el archivo');
      return subirMalla({ carreraId, anio: Number(v.anio), vigenteDesde: v.vigenteDesde }, archivo);
    },
    onSuccess: async (_creada, v) => {
      toast(`La malla ${v.anio} quedó cargada.`);
      // La versión nueva también debe aparecer como objeto de nivel Malla en Nueva sesión.
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['mallas'] }),
        cliente.invalidateQueries({ queryKey: ['objetos', carreraId] }),
      ]);
      alCerrar();
    },
    onError: (error) => {
      const { campos, general } = traducirErrorApi(error);
      const sobrantes: string[] = [];
      for (const [campo, mensaje] of Object.entries(campos)) {
        if (campo === 'anio' || campo === 'vigenteDesde') setError(campo, { message: mensaje });
        else if (campo === 'archivo') setErrorArchivo(mensaje);
        else sobrantes.push(mensaje);
      }
      setErrorGeneral(general ?? (sobrantes.length > 0 ? sobrantes.join(' ') : null));
    },
  });

  const recibir = (archivos: File[]) => {
    const elegido = archivos[0];
    if (elegido === undefined) return;
    const mensaje = validarArchivo(elegido.name, elegido.size, 'malla');
    setErrorArchivo(mensaje);
    if (mensaje === null) setArchivo(elegido);
  };

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        setErrorGeneral(null);
        if (archivo === null) setErrorArchivo('Adjunta el PDF de la malla.');
        void handleSubmit((v) => {
          if (archivo !== null) subir.mutate(v);
        })(e);
      }}
    >
      <p className="text-texto-2">{carreraNombre}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <Campo id="m-anio" etiqueta="Año de la malla" error={formState.errors.anio?.message}>
          <Entrada
            id="m-anio"
            type="text"
            inputMode="numeric"
            error={formState.errors.anio?.message}
            {...register('anio', {
              validate: (v) => {
                const a = Number(v);
                if (!/^\d{4}$/.test(v) || a < 2000 || a > anioActual + 1) return 'Escribe el año con cuatro dígitos.';
                return versiones.some((m) => m.anio === a) ? `Ya existe la malla ${v} de esta carrera.` : true;
              },
            })}
          />
        </Campo>
        <Campo id="m-vigente" etiqueta="Vigente desde" error={formState.errors.vigenteDesde?.message}>
          <Entrada
            id="m-vigente"
            type="date"
            error={formState.errors.vigenteDesde?.message}
            {...register('vigenteDesde', { validate: (v) => v !== '' || 'Indica desde cuándo rige.' })}
          />
        </Campo>
      </div>
      <div className="grid gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Archivo de la malla</span>
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
              id="m-archivo"
              etiqueta="Archivo de la malla"
              texto="Arrastra el archivo aquí o"
              ayuda="PDF de hasta 20 MB."
              accept=".pdf,application/pdf"
              alRecibir={recibir}
            />
            {errorArchivo !== null && <p className="text-[12.5px] font-medium text-error">{errorArchivo}</p>}
          </>
        )}
      </div>
      {errorGeneral !== null && (
        <Aviso tipo="error" rol="alert">
          {errorGeneral}
        </Aviso>
      )}
      <div className="flex justify-end gap-3">
        <Boton variante="secundario" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={subir.isPending}>
          {subir.isPending ? 'Subiendo' : 'Subir versión'}
        </Boton>
      </div>
    </form>
  );
}

export function DialogoMalla({ abierto, alCerrar, ...resto }: Props) {
  return (
    <Dialogo abierto={abierto} titulo="Nueva versión de malla" alCerrar={alCerrar}>
      <Contenido {...resto} alCerrar={alCerrar} />
    </Dialogo>
  );
}
