import type { ReactNode } from 'react';
import { cn } from '../comun/ui/cn';

export interface FilaBarra {
  clave: string;
  nombre: string;
  total: number;
  /** Texto del tooltip nativo (`title`). */
  detalle: string;
  /** Segmentos apilados por estado; si falta, la barra es de un solo tono. */
  segmentos?: Array<{ color: string; valor: number }>;
}

interface Props {
  filas: FilaBarra[];
  alElegir: (clave: string) => void;
  vacio: ReactNode;
}

/**
 * Barras horizontales como botones HTML: el ancho es proporcional al mayor valor y el clic filtra el listado.
 * Se evita dibujarlas con Recharts porque así el teclado y los lectores de pantalla las tratan como botones.
 */
export function BarrasClicables({ filas, alElegir, vacio }: Props) {
  if (filas.length === 0) return <p className="text-texto-2">{vacio}</p>;
  const maximo = Math.max(1, ...filas.map((f) => f.total));
  return (
    <ul className="grid gap-0.5">
      {filas.map((f) => (
        <li key={f.clave}>
          <button
            type="button"
            title={f.detalle}
            onClick={() => {
              alElegir(f.clave);
            }}
            className="grid w-full cursor-pointer grid-cols-[minmax(0,10rem)_minmax(0,1fr)_1.8rem] items-center gap-3 rounded-xs p-2 text-left hover:bg-superficie-2"
          >
            <span className="text-[13px] [overflow-wrap:anywhere]">{f.nombre}</span>
            <span aria-hidden="true" className={cn('block h-2.5 rounded-r-[5px]', f.segmentos === undefined && 'bg-neutro-fondo')}>
              {f.segmentos === undefined ? (
                <span className="block h-2.5 min-w-1 rounded-r-[5px] bg-azul" style={{ width: `${String((f.total / maximo) * 100)}%` }} />
              ) : (
                <span className="flex h-2.5 gap-0.5" style={{ width: `${String((f.total / maximo) * 100)}%` }}>
                  {f.segmentos
                    .filter((s) => s.valor > 0)
                    .map((s) => (
                      <span key={s.color} className="block min-w-1 first:rounded-l-[5px] last:rounded-r-[5px]" style={{ flex: s.valor, background: s.color }} />
                    ))}
                </span>
              )}
            </span>
            <b className="text-right text-navy tabular-nums">{f.total}</b>
          </button>
        </li>
      ))}
    </ul>
  );
}
