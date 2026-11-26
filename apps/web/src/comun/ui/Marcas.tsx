import type { ReactNode } from 'react';
import { cn } from './cn';

type Tono = 'azul' | 'ok' | 'neutro' | 'alerta';
const TONOS: Record<Tono, string> = {
  azul: 'bg-azul-claro text-azul-osc border-azul-borde',
  ok: 'bg-ok-fondo text-ok border-ok-borde',
  neutro: 'bg-neutro-fondo text-neutro border-neutro-borde',
  alerta: 'bg-alerta-fondo text-alerta border-alerta-borde',
};

export function Pill({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONOS[tono])}>
      {children}
    </span>
  );
}

export function Tarjeta({ className, children, ...resto }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('rounded-r border border-borde bg-superficie p-5 shadow-sombra-1', className)} {...resto}>
      {children}
    </section>
  );
}

/** Número de registro en IBM Plex Mono para que los dígitos se alineen y se lean sin ambigüedad. */
export function Folio({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[13px] whitespace-nowrap font-semibold text-navy', className)}>{children}</span>;
}
