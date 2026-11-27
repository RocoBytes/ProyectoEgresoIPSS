import { Bar, BarChart, CartesianGrid, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import type { PanelMes } from '@ipss/shared';
import { COLORES, ejeY, indiceMaximo, MESES, partesTexto, textoAjustes } from './calculos';

interface Props {
  anio: number;
  porMes: PanelMes[];
  /** Meses posteriores a este no han llegado: se atenúan y el tooltip lo dice. */
  ultimoMes: number;
  donde: string;
}

/** Texto de un mes, común al tooltip y a la tabla para lectores de pantalla. */
export function textoMes(m: PanelMes, anio: number, ultimoMes: number): string {
  const nombre = `${MESES[m.mes - 1] ?? ''} ${String(anio)}`;
  if (m.mes > ultimoMes) return `${nombre}: aún no llega`;
  return `${nombre}: ${textoAjustes(m.total)}${m.total > 0 ? ` (${partesTexto(m)})` : ''}`;
}

interface LabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
}

interface PropsTick {
  x?: number | string;
  y?: number | string;
  payload?: { value: string | number; index: number };
}

function TooltipMes({ activo, mes, anio, ultimoMes }: { activo: boolean; mes: PanelMes | undefined; anio: number; ultimoMes: number }) {
  if (!activo || mes === undefined) return null;
  return <div className="rounded-s bg-navy px-3 py-2 text-xs font-medium text-white shadow-sombra-2">{textoMes(mes, anio, ultimoMes)}</div>;
}

/**
 * Columnas apiladas por mes de la sesión. El dibujo es solo para quien ve la pantalla: la misma
 * información está en la tabla oculta de debajo, que sí leen los lectores de pantalla.
 */
export function GraficoMeses({ anio, porMes, ultimoMes, donde }: Props) {
  const totales = porMes.map((m) => m.total);
  const { ticks, tope } = ejeY(Math.max(1, ...totales));
  const mesMaximo = indiceMaximo(totales);
  return (
    <div>
      <div aria-hidden="true">
        <BarChart
          responsive
          accessibilityLayer={false}
          data={porMes}
          style={{ width: '100%', height: 256 }}
          margin={{ top: 24, right: 4, bottom: 0, left: -16 }}
        >
          <CartesianGrid vertical={false} stroke="#e4dfd8" />
          <XAxis
            dataKey="mes"
            tickLine={false}
            axisLine={{ stroke: '#c9c2b8' }}
            interval={0}
            tick={({ x, y, payload }: PropsTick) => (
              <text x={x} y={Number(y ?? 0) + 14} textAnchor="middle" fontSize={11} fill="#5c6773" opacity={Number(payload?.value) > ultimoMes ? 0.55 : 1}>
                {MESES[Number(payload?.value) - 1]}
              </text>
            )}
          />
          <YAxis ticks={ticks} domain={[0, tope]} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#5c6773' }} width={36} />
          <Tooltip
            cursor={{ fill: '#faf9f7' }}
            content={({ active, payload }) => (
              <TooltipMes activo={active === true} mes={payload?.[0]?.payload as PanelMes | undefined} anio={anio} ultimoMes={ultimoMes} />
            )}
          />
          <Bar dataKey="cerrados" stackId="m" fill={COLORES.cerrados} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="abiertos" stackId="m" fill={COLORES.abiertos} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="anulados" stackId="m" fill={COLORES.anulados} maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          {/*
            Barra invisible con el total del mes, sobre su propio eje X oculto para no desplazar la pila. Su cima es siempre la cima
            de la columna: la última barra de la pila mide cero cuando el mes no tiene anulados y ahí no hay dónde colgar la cifra.
          */}
          <XAxis xAxisId="rotulo" dataKey="mes" hide />
          <Bar xAxisId="rotulo" dataKey="total" fill="transparent" maxBarSize={22} isAnimationActive={false} legendType="none" tooltipType="none">
            {/* Recharts omite las barras de altura cero al numerar, así que el mes se identifica por su dato y no por el índice. */}
            <LabelList
              dataKey={(fila: PanelMes) => (fila.mes === mesMaximo + 1 ? fila.total : null)}
              content={({ x, y, width, value }: LabelProps) =>
                typeof value !== 'number' ? null : (
                  <text x={Number(x) + Number(width) / 2} y={Number(y) - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#102b42">
                    {value}
                  </text>
                )
              }
            />
          </Bar>
        </BarChart>
      </div>
      <table className="sr-only">
        <caption>{`Ajustes por mes de la sesión en ${String(anio)} para ${donde}`}</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Cerrados</th>
            <th scope="col">Abiertos</th>
            <th scope="col">Anulados</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {porMes.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{m.mes > ultimoMes ? `${MESES[m.mes - 1] ?? ''} (aún no llega)` : (MESES[m.mes - 1] ?? '')}</th>
              <td>{m.cerrados}</td>
              <td>{m.abiertos}</td>
              <td>{m.anulados}</td>
              <td>{m.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
