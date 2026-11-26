import type { ReactNode } from 'react';

/** Marcador de las pantallas que llegan en hitos posteriores. */
export function EnConstruccion({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <section aria-labelledby="titulo-pagina" className="grid gap-4">
      <h1 id="titulo-pagina" className="text-2xl leading-[1.2] font-bold tracking-[-0.01em] text-navy">
        {titulo}
      </h1>
      {children ?? <p className="text-texto-2">En construcción: llega en el próximo hito.</p>}
    </section>
  );
}
