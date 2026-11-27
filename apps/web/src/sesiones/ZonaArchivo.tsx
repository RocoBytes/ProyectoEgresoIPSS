import { useRef, useState } from 'react';
import { cn } from '../comun/ui/cn';

interface Props {
  id: string;
  etiqueta: string;
  texto: string;
  ayuda: string;
  multiple?: boolean;
  accept: string;
  alRecibir: (archivos: File[]) => void;
}

/** Zona para soltar archivos o elegirlos con el botón; el `<input>` real queda oculto pero accesible. */
export function ZonaArchivo({ id, etiqueta, texto, ayuda, multiple = false, accept, alRecibir }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => {
        setEncima(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const archivos = Array.from(e.dataTransfer.files);
        if (archivos.length > 0) alRecibir(multiple ? archivos : archivos.slice(0, 1));
      }}
      className={cn(
        'grid justify-items-center gap-1 rounded-s border-2 border-dashed border-borde-fuerte bg-superficie-2 px-4 py-6 text-center text-[13px]',
        encima && 'border-azul bg-azul-claro',
      )}
    >
      <p>
        {texto}{' '}
        <button
          type="button"
          id={id}
          onClick={() => entrada.current?.click()}
          className="cursor-pointer font-semibold text-azul-osc underline"
        >
          elige un archivo
        </button>
      </p>
      <p className="text-xs text-texto-2">{ayuda}</p>
      <input
        ref={entrada}
        type="file"
        hidden
        aria-label={etiqueta}
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? []);
          if (archivos.length > 0) alRecibir(archivos);
          e.target.value = '';
        }}
      />
    </div>
  );
}
