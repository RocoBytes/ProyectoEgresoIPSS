import { useEffect, useRef, type ReactNode } from 'react';
import { Icono } from '../Icono';
import { Boton } from './Boton';

interface Props {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
}

/**
 * Diálogo modal sobre `<dialog>` nativo: showModal() atrapa el foco y deja el resto inerte.
 * El contenido solo existe mientras está abierto, así los formularios internos empiezan limpios.
 */
export function Dialogo({ abierto, titulo, alCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo === null) return;
    if (abierto && !dialogo.open) {
      previo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // jsdom no implementa showModal: el atributo basta para las pruebas.
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
    } else if (!abierto && dialogo.open) {
      if (typeof dialogo.close === 'function') dialogo.close();
      else dialogo.removeAttribute('open');
      // El foco vuelve a quien abrió el diálogo, que es donde el usuario estaba.
      previo.current?.focus();
    }
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="titulo-dialogo"
      onCancel={(evento) => {
        // Escape nativo: se cierra por estado para no dejar el estado de React desfasado.
        evento.preventDefault();
        alCerrar();
      }}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          evento.preventDefault();
          alCerrar();
        }
      }}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-r border border-borde bg-superficie p-0 text-texto shadow-sombra-2 backdrop:bg-navy/50"
    >
      {abierto && (
        <div className="grid gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 id="titulo-dialogo" className="text-lg font-bold text-navy">
              {titulo}
            </h2>
            <Boton variante="icono" aria-label="Cerrar" onClick={alCerrar}>
              <Icono nombre="x" />
            </Boton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
