import { Cell, Pie, PieChart } from 'recharts';
import type { IndicadoresPanel } from '@ipss/shared';
import { COLORES, ESTADOS_PANEL, porcentaje, textoAjustes } from './calculos';

interface Props {
  indicadores: IndicadoresPanel;
  alElegir: (filtro: string) => void;
}

/** Dona de estados con el total al centro. La leyenda son botones: filtrar por estado también se hace con teclado. */
export function GraficoEstados({ indicadores, alElegir }: Props) {
  const total = indicadores.total;
  const partes = ESTADOS_PANEL.map((e) => ({ ...e, valor: indicadores[e.clave] }));
  // Sin ajustes se dibuja solo la pista gris para que la dona no desaparezca.
  const datos = total > 0 ? partes.filter((p) => p.valor > 0) : [{ clave: 'pista', valor: 1 }];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
      <div className="relative size-[168px] flex-none">
        <div aria-hidden="true">
          <PieChart width={168} height={168} accessibilityLayer={false}>
            <Pie
              data={datos}
              dataKey="valor"
              nameKey="clave"
              innerRadius={51}
              outerRadius={73}
              startAngle={90}
              endAngle={-270}
              paddingAngle={datos.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {datos.map((d) => (
                <Cell key={d.clave} fill={d.clave === 'pista' ? '#eeebe7' : COLORES[d.clave as keyof typeof COLORES]} />
              ))}
            </Pie>
          </PieChart>
        </div>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <b className="text-[34px] leading-none font-bold tracking-tight text-navy">{total}</b>
          <span className="mt-0.5 text-xs text-texto-2">{total === 1 ? 'ajuste' : 'ajustes'}</span>
        </div>
      </div>
      <ul className="grid min-w-44 gap-1">
        {partes.map((p) => (
          <li key={p.clave}>
            <button
              type="button"
              onClick={() => {
                alElegir(p.filtro);
              }}
              title={`${p.etiqueta}: ${String(p.valor)} de ${String(total)}. Clic para verlos en el listado.`}
              className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 rounded-xs px-2 py-1.5 text-left text-[13px] hover:bg-superficie-2"
            >
              <i aria-hidden="true" className="size-2.5 rounded-xs" style={{ background: COLORES[p.clave] }} />
              <span>{p.etiqueta}</span>
              <b className="text-navy tabular-nums">{p.valor}</b>
              <span className="min-w-10 text-right text-texto-2 tabular-nums">{`${String(porcentaje(p.valor, total))} %`}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="sr-only">{`Total: ${textoAjustes(total)}.`}</p>
    </div>
  );
}
