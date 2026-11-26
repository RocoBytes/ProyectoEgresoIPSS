import type { NivelImpacto } from '@ipss/shared';

export interface DatosObjeto {
  nivelImpacto: NivelImpacto;
  carrera: string;
  /** Nombre de la asignatura o del módulo. */
  asignatura?: string | null;
  anioMalla?: number | null;
  recurso?: string | null;
}

/** Texto del objeto de un registro según el prototipo. Es la única función que lo arma, para que el listado, el detalle y el alta coincidan. */
export function textoDelObjeto(d: DatosObjeto): string {
  switch (d.nivelImpacto) {
    case 'RECURSO':
      return `${d.asignatura ?? ''} · ${d.recurso ?? ''}`;
    case 'ASIGNATURA':
    case 'MODULO':
      return d.asignatura ?? '';
    case 'MALLA':
      return `Malla ${d.anioMalla ?? ''}`;
    case 'PERFIL_INGRESO':
      return `Perfil de ingreso de ${d.carrera}`;
    case 'PERFIL_EGRESO':
      return `Perfil de egreso de ${d.carrera}`;
  }
}
