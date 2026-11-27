/** Marca del prototipo: la línea de trazabilidad sobre el cuadrado dorado. */
export function Logo({ tamano }: { tamano: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 36 36" aria-hidden="true" className="flex-none">
      <rect width="36" height="36" rx="9" fill="#CFB47C" />
      <path
        d="M9 24.5h5.5l4-9 4 4.5 4.5-9"
        fill="none"
        stroke="#102B42"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="24.5" r="2.5" fill="#102B42" />
      <circle cx="27" cy="11" r="2.5" fill="#102B42" />
    </svg>
  );
}

/** Logo con el nombre de la plataforma, sobre fondo azul marino. */
export function Marca({ tamano }: { tamano: number }) {
  return (
    <div className="flex items-center gap-[11px] leading-[1.15] text-white">
      <Logo tamano={tamano} />
      <div>
        <b className="block text-[15px] font-bold">Perfil de Egreso</b>
        <span className="mt-0.5 block text-[11px] tracking-[.04em] text-sobre-navy-2">
          Plataforma de validación
        </span>
      </div>
    </div>
  );
}
