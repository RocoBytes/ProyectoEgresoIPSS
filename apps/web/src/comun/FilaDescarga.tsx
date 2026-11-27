import type { EvidenciaResumen } from '@ipss/shared';
import { tamanoTexto } from './tamano';

/** Fila de un archivo ya guardado, con su peso y el enlace de descarga (solo por la API, con sesión). */
export function FilaDescarga({ e }: { e: EvidenciaResumen }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-s border border-borde bg-superficie-2 px-3 py-2 text-[13px]">
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {e.nombreOriginal} <span className="text-texto-2">{tamanoTexto(e.tamano)}</span>
      </span>
      <a href={`/api/evidencias/${e.id}/descarga`} className="font-semibold whitespace-nowrap text-azul-osc underline">
        Descargar {e.nombreOriginal}
      </a>
    </li>
  );
}
