import type { DetalleRegistro, EntradaHistorial } from '@ipss/shared';
import { diferenciaDias, fechaDeMarca, fechaTexto } from '../comun/fecha-texto';
import { plural } from '../comun/plural';

export interface Paso {
  clase: string;
  nombre: string;
  valor: string;
  detalle: string;
}

/** Los cuatro pasos de la línea de trazabilidad. `hoy` es AAAA-MM-DD y se inyecta para poder probarlo. */
export function pasosTrazabilidad(r: DetalleRegistro, hoy: string): Paso[] {
  const anulacion = r.historial.find((h) => h.tipo === 'ANULACION');
  let compromiso: Pick<Paso, 'clase' | 'detalle'>;
  let final: Paso;
  if (r.estado === 'CERRADO') {
    const atraso = r.fechaEfectiva !== null ? diferenciaDias(r.fechaComprometida, r.fechaEfectiva) : 0;
    compromiso = { clase: 'hecho', detalle: atraso > 0 ? `cumplido con ${plural(atraso, 'día', 'días')} de atraso` : 'cumplido en plazo' };
    final = { clase: 'ok', nombre: 'Cierre', valor: r.fechaEfectiva !== null ? fechaTexto(r.fechaEfectiva) : '—', detalle: 'con evidencia' };
  } else if (r.estado === 'ANULADO') {
    compromiso = { clase: '', detalle: 'sin efecto por la anulación' };
    final = {
      clase: 'neutro',
      nombre: 'Anulación',
      valor: anulacion !== undefined ? fechaTexto(fechaDeMarca(anulacion.fecha)) : '—',
      detalle: 'con motivo registrado',
    };
  } else {
    const d = diferenciaDias(hoy, r.fechaComprometida);
    compromiso =
      d < 0
        ? { clase: 'alerta', detalle: `vencido hace ${plural(-d, 'día', 'días')}` }
        : { clase: '', detalle: d === 0 ? 'vence hoy' : `faltan ${plural(d, 'día', 'días')}` };
    final = { clase: '', nombre: 'Cierre', valor: 'Pendiente', detalle: 'requiere fecha efectiva y evidencia' };
  }
  return [
    { clase: 'hecho', nombre: 'Sesión', valor: fechaTexto(r.sesion.fecha), detalle: r.sesion.canal },
    { clase: 'hecho', nombre: 'Registro', valor: fechaTexto(fechaDeMarca(r.creadoEn)), detalle: `ingresado por ${r.sesion.creadoPor}` },
    { nombre: 'Compromiso', valor: fechaTexto(r.fechaComprometida), ...compromiso },
    final,
  ];
}

export const TITULO_HISTORIAL: Record<EntradaHistorial['tipo'], string> = {
  CREACION: 'Creación',
  EDICION: 'Edición',
  CIERRE: 'Cierre',
  ANULACION: 'Anulación',
};

const comoTexto = (valor: unknown) => (typeof valor === 'string' ? valor : '');

/** Texto de cada entrada del historial, con las frases del prototipo. */
export function textoHistorial(h: EntradaHistorial, r: DetalleRegistro): string {
  switch (h.tipo) {
    case 'CREACION':
      return 'Registro creado en estado abierto.';
    case 'EDICION': {
      const partes: string[] = [];
      const fecha = h.cambios?.fechaComprometida;
      if (fecha !== undefined)
        partes.push(`la fecha comprometida de ${fechaTexto(comoTexto(fecha.antes))} a ${fechaTexto(comoTexto(fecha.despues))}`);
      const descripcion = h.cambios?.descripcion;
      if (descripcion !== undefined) partes.push(`la descripción (antes: “${comoTexto(descripcion.antes)}”)`);
      return `Cambió ${partes.join(' y ')}.`;
    }
    case 'CIERRE':
      return r.fechaEfectiva !== null && r.evidenciaCierre !== null
        ? `Cerrado con fecha efectiva ${fechaTexto(r.fechaEfectiva)} y evidencia “${r.evidenciaCierre.nombreOriginal}”.`
        : 'Registro cerrado.';
    case 'ANULACION':
      return `Anulado. Motivo: ${r.motivoAnulacion ?? ''}`;
  }
}
