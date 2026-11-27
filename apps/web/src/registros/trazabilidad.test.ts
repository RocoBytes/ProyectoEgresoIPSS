import { describe, expect, it } from 'vitest';
import type { DetalleRegistro } from '@ipss/shared';
import { pasosTrazabilidad, textoHistorial } from './trazabilidad';

export function detalleBase(cambios: Partial<DetalleRegistro> = {}): DetalleRegistro {
  return {
    id: 'r1',
    correlativo: 'R-2026-001',
    estado: 'ABIERTO',
    vencido: false,
    sector: { id: 's1', nombre: 'Tecnologías' },
    carrera: { id: 'c1', nombre: 'Informática' },
    nivelImpacto: 'ASIGNATURA',
    objeto: 'Programación',
    recurso: null,
    descripcion: 'Actualizar los contenidos de programación del segundo semestre.',
    fechaComprometida: '2026-06-10',
    fechaEfectiva: null,
    comentarioCierre: null,
    motivoAnulacion: null,
    evidenciaCierre: null,
    creadoEn: '2026-05-02T15:00:00Z',
    sesion: {
      id: 'se1',
      canal: 'Comité sectorial',
      fecha: '2026-05-02',
      instancia: 'Comité de mayo',
      participantes: ['Ana', 'Beto'],
      creadoPor: 'Paula Rojas',
      evidencias: { acta: null, fotos: [] },
    },
    historial: [{ tipo: 'CREACION', fecha: '2026-05-02T15:00:00Z', usuario: 'Paula Rojas' }],
    otrosRegistros: [],
    permisos: { puedeModificar: true },
    ...cambios,
  };
}

const compromiso = (r: DetalleRegistro, hoy: string) => pasosTrazabilidad(r, hoy)[2]?.detalle;

describe('trazabilidad', () => {
  it('abierto: faltan, vence hoy y vencido hace', () => {
    expect(compromiso(detalleBase(), '2026-06-05')).toBe('faltan 5 días');
    expect(compromiso(detalleBase(), '2026-06-09')).toBe('faltan 1 día');
    expect(compromiso(detalleBase(), '2026-06-10')).toBe('vence hoy');
    expect(compromiso(detalleBase(), '2026-06-13')).toBe('vencido hace 3 días');
    expect(pasosTrazabilidad(detalleBase(), '2026-06-05')[3]?.valor).toBe('Pendiente');
  });
  it('cerrado: en plazo o con atraso', () => {
    const cerrado = detalleBase({ estado: 'CERRADO', fechaEfectiva: '2026-06-10' });
    expect(compromiso(cerrado, '2026-07-01')).toBe('cumplido en plazo');
    expect(pasosTrazabilidad(cerrado, '2026-07-01')[3]).toMatchObject({ nombre: 'Cierre', valor: '10-06-2026' });
    expect(compromiso(detalleBase({ estado: 'CERRADO', fechaEfectiva: '2026-06-12' }), '2026-07-01')).toBe('cumplido con 2 días de atraso');
  });
  it('anulado', () => {
    const r = detalleBase({ estado: 'ANULADO', historial: [{ tipo: 'ANULACION', fecha: '2026-06-01T15:00:00Z', usuario: 'X' }] });
    expect(compromiso(r, '2026-07-01')).toBe('sin efecto por la anulación');
    expect(pasosTrazabilidad(r, '2026-07-01')[3]).toMatchObject({ nombre: 'Anulación', valor: '01-06-2026' });
  });
  it('textos del historial', () => {
    const r = detalleBase({ motivoAnulacion: 'Duplicado' });
    expect(textoHistorial({ tipo: 'CREACION', fecha: '', usuario: '' }, r)).toBe('Registro creado en estado abierto.');
    expect(
      textoHistorial(
        {
          tipo: 'EDICION',
          fecha: '',
          usuario: '',
          cambios: {
            fechaComprometida: { antes: '2026-06-10', despues: '2026-06-20' },
            descripcion: { antes: 'Texto anterior', despues: 'Nuevo' },
          },
        },
        r,
      ),
    ).toBe('Cambió la fecha comprometida de 10-06-2026 a 20-06-2026 y la descripción (antes: “Texto anterior”).');
    expect(textoHistorial({ tipo: 'ANULACION', fecha: '', usuario: '' }, r)).toBe('Anulado. Motivo: Duplicado');
  });
});
