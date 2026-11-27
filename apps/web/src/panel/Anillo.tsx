import { porcentaje } from './calculos';

interface Props {
  parte: number;
  todo: number;
  /** Colores del arco y de la pista. */
  color: string;
  pista: string;
}

const R = 44;
const CIRCUNFERENCIA = 2 * Math.PI * R;

/** Anillo de porcentaje; con denominador cero muestra «—» en vez de 0 %. */
export function Anillo({ parte, todo, color, pista }: Props) {
  const p = todo > 0 ? parte / todo : 0;
  return (
    <span className="relative block size-[104px] flex-none">
      <svg viewBox="0 0 104 104" width="104" height="104" aria-hidden="true" className="block">
        <circle cx="52" cy="52" r={R} fill="none" strokeWidth="10" stroke={pista} />
        {p > 0 && (
          <circle
            cx="52"
            cy="52"
            r={R}
            fill="none"
            strokeWidth="10"
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={`${(CIRCUNFERENCIA * p).toFixed(1)} ${CIRCUNFERENCIA.toFixed(1)}`}
            transform="rotate(-90 52 52)"
          />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xl font-bold tracking-tight text-navy">{todo > 0 ? `${String(porcentaje(parte, todo))} %` : '—'}</span>
    </span>
  );
}
