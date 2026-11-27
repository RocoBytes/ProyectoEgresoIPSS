import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

interface PropsCampo {
  id: string;
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}

/** Etiqueta, control, ayuda y error. Los controles enlazan ayuda y error con `aria-describedby`. */
export function Campo({ id, etiqueta, ayuda, error, className, children }: PropsCampo) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-navy">
        {etiqueta}
      </label>
      {children}
      {ayuda !== undefined && (
        <span id={`${id}-ayuda`} className="text-xs text-texto-2">
          {ayuda}
        </span>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} className="text-[12.5px] font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}

interface ComunControl {
  id: string;
  error?: string;
  conAyuda?: boolean;
}

function descrito({ id, error, conAyuda }: ComunControl): string | undefined {
  const ids = [conAyuda === true ? `${id}-ayuda` : '', error !== undefined ? `${id}-error` : ''].filter((x) => x !== '');
  return ids.length > 0 ? ids.join(' ') : undefined;
}

const BASE =
  'min-h-10 w-full rounded-s border bg-superficie px-3 text-[13.5px] text-texto disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-texto-2';
const claseBorde = (error?: string) => (error !== undefined ? 'border-error' : 'border-borde-fuerte');

export function Entrada({
  error,
  conAyuda,
  className,
  ...resto
}: ComunControl & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>) {
  return (
    <input
      aria-invalid={error !== undefined}
      aria-describedby={descrito({ id: resto.id, error, conAyuda })}
      className={cn(BASE, claseBorde(error), className)}
      {...resto}
    />
  );
}

export function AreaTexto({
  error,
  conAyuda,
  className,
  ...resto
}: ComunControl & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>) {
  return (
    <textarea
      aria-invalid={error !== undefined}
      aria-describedby={descrito({ id: resto.id, error, conAyuda })}
      className={cn(BASE, 'min-h-24 py-2', claseBorde(error), className)}
      {...resto}
    />
  );
}

/** `<select>` nativo: teclado, lectores de pantalla y móvil funcionan sin código propio. */
export function Selector({
  error,
  conAyuda,
  className,
  children,
  ...resto
}: ComunControl & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>) {
  return (
    <select
      aria-invalid={error !== undefined}
      aria-describedby={descrito({ id: resto.id, error, conAyuda })}
      className={cn(BASE, claseBorde(error), className)}
      {...resto}
    >
      {children}
    </select>
  );
}
