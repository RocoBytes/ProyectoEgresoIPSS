import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from './Icono';

export type TipoAviso = 'error' | 'alerta' | 'info' | 'ok' | 'neutro';

const ESTILOS: Record<TipoAviso, { clases: string; icono: NombreIcono }> = {
  error: { clases: 'bg-error-fondo border-error-borde text-error', icono: 'error' },
  alerta: { clases: 'bg-alerta-fondo border-alerta-borde text-alerta', icono: 'alerta' },
  info: { clases: 'bg-azul-claro border-azul-borde text-azul-osc', icono: 'info' },
  ok: { clases: 'bg-ok-fondo border-ok-borde text-ok', icono: 'check' },
  neutro: { clases: 'bg-neutro-fondo border-neutro-borde text-neutro', icono: 'info' },
};

interface Props {
  tipo: TipoAviso;
  titulo?: string;
  children?: ReactNode;
  /** `alert` para errores que interrumpen; `status` para información que no urge. */
  rol?: 'alert' | 'status';
}

/** Aviso en línea del prototipo. */
export function Aviso({ tipo, titulo, children, rol }: Props) {
  const { clases, icono } = ESTILOS[tipo];
  return (
    <div role={rol} className={`flex items-start gap-2.5 rounded-s border px-3.5 py-3 text-[13px] ${clases}`}>
      <Icono nombre={icono} className="mt-px" />
      <div className="grid min-w-0 gap-0.5">
        {titulo !== undefined && <b className="font-bold">{titulo}</b>}
        {children !== undefined && <span>{children}</span>}
      </div>
    </div>
  );
}
