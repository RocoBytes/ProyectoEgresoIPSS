import type { NivelImpacto } from '@ipss/shared';

export const NIVELES: Array<{ valor: NivelImpacto; etiqueta: string }> = [
  { valor: 'RECURSO', etiqueta: 'Recurso' },
  { valor: 'ASIGNATURA', etiqueta: 'Asignatura' },
  { valor: 'MODULO', etiqueta: 'Módulo' },
  { valor: 'MALLA', etiqueta: 'Malla' },
  { valor: 'PERFIL_INGRESO', etiqueta: 'Perfil de ingreso' },
  { valor: 'PERFIL_EGRESO', etiqueta: 'Perfil de egreso' },
];

export function etiquetaNivel(nivel: NivelImpacto): string {
  return NIVELES.find((n) => n.valor === nivel)?.etiqueta ?? nivel;
}
