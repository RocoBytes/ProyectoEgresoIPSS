import { cn } from '../comun/ui/cn';

interface Props {
  valores: number[];
  tono: 'neutro' | 'acento' | 'oro';
}

const TONOS = {
  neutro: { linea: 'stroke-neutro-relleno', area: 'fill-neutro-relleno', punto: 'bg-neutro-relleno shadow-[0_0_0_2px_var(--color-superficie)]' },
  acento: { linea: 'stroke-azul', area: 'fill-azul', punto: 'bg-azul shadow-[0_0_0_2px_var(--color-superficie)]' },
  oro: { linea: 'stroke-oro', area: 'fill-oro', punto: 'bg-oro shadow-[0_0_0_2px_var(--color-navy)]' },
} as const;

/** Línea de tendencia de hasta 12 puntos. Es decorativa: la cifra y su texto ya van al lado. */
export function Chispa({ valores, tono }: Props) {
  const maximo = Math.max(1, ...valores);
  const x = (i: number) => (i / 11) * 100;
  const y = (v: number) => 36 - (v / maximo) * 30;
  const linea = `M${valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}`;
  const ultimo = valores[valores.length - 1] ?? 0;
  const t = TONOS[tono];
  return (
    <span aria-hidden="true" className="relative mr-1.5 block h-10">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block size-full overflow-visible">
        <path d={`${linea} L${x(valores.length - 1).toFixed(1)},40 L0,40 Z`} className={cn('stroke-none', t.area, tono === 'oro' ? 'opacity-[0.16]' : 'opacity-10')} />
        <path d={linea} className={cn('fill-none stroke-2 [stroke-linecap:round] [stroke-linejoin:round]', t.linea)} vectorEffect="non-scaling-stroke" />
      </svg>
      <i
        className={cn('absolute size-2.5 -translate-1/2 rounded-full', t.punto)}
        style={{ left: `${String(x(valores.length - 1))}%`, top: `${String((y(ultimo) / 40) * 100)}%` }}
      />
    </span>
  );
}
