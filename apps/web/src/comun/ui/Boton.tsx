import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

/** También se usa para dar aspecto de botón a un enlace de navegación. */
export const clasesBoton = cva(
  'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-s border px-4 text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variante: {
        primario: 'border-azul bg-azul text-white hover:bg-azul-osc',
        secundario: 'border-borde-fuerte bg-superficie text-navy hover:border-navy hover:bg-superficie-2',
        fantasma: 'border-transparent bg-transparent text-texto-2 hover:bg-neutro-fondo hover:text-texto',
        peligro: 'border-error bg-error text-white hover:opacity-90',
        enlace: 'min-h-0 border-transparent bg-transparent px-0 text-azul-osc underline hover:text-navy',
        icono: 'size-9 min-h-0 border-borde bg-superficie p-0 text-navy hover:border-navy',
      },
      ancho: { si: 'w-full', no: '' },
    },
    defaultVariants: { variante: 'primario', ancho: 'no' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof clasesBoton>;

export function Boton({ variante, ancho, className, type = 'button', ...resto }: Props) {
  return <button type={type} className={cn(clasesBoton({ variante, ancho }), className)} {...resto} />;
}
