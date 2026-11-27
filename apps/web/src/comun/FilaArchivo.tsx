import { Icono } from './Icono';
import { tamanoTexto } from './tamano';
import { Boton } from './ui/Boton';

interface Props {
  archivo: File;
  error?: string;
  alQuitar: () => void;
}

/** Fila de un archivo ya elegido, con su peso y el botón para quitarlo. */
export function FilaArchivo({ archivo, error, alQuitar }: Props) {
  return (
    <li className="grid gap-1">
      <div className="flex items-center justify-between gap-3 rounded-s border border-borde bg-superficie-2 px-3 py-2 text-[13px]">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <b>{archivo.name}</b> <span className="text-texto-2">{tamanoTexto(archivo.size)}</span>
        </span>
        <Boton variante="icono" aria-label={`Quitar ${archivo.name}`} onClick={alQuitar}>
          <Icono nombre="x" />
        </Boton>
      </div>
      {error !== undefined && <p className="text-[12.5px] font-medium text-error">{error}</p>}
    </li>
  );
}
