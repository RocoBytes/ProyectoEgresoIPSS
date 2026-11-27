import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Workbook } from 'exceljs';
import { cargarCatalogos, generarPlantilla, leerPlanilla } from '../src/cli/cargar-catalogos';
import { formatearResultado } from '../src/cli/catalogos';
import { CARRERAS_EJEMPLO, CANALES_EJEMPLO, SECTORES_EJEMPLO } from '../src/cli/datos-ejemplo';
import { PrismaClient } from '../src/generated/prisma/client';
import { URL_API, conMigrador } from './ayudas/acceso';

type Fila = string[];
interface Hojas { sectores?: Fila[]; carreras?: Fila[]; asignaturas?: Fila[]; canales?: Fila[] }

async function planilla(h: Hojas): Promise<Buffer> {
  const libro = new Workbook();
  const agregar = (nombre: string, encabezado: string[], filas: Fila[] | undefined): void => {
    const hoja = libro.addWorksheet(nombre);
    hoja.addRow(encabezado);
    for (const f of filas ?? []) hoja.addRow(f);
  };
  agregar('Sectores', ['Nombre'], h.sectores);
  agregar('Carreras', ['Sector', 'Nombre'], h.carreras);
  agregar('Asignaturas', ['Carrera', 'Tipo', 'Nombre', 'Código'], h.asignaturas);
  agregar('Canales', ['Nombre', 'Activo'], h.canales);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe('carga de catálogos por planilla (contra la base de pruebas, como ipss_api)', () => {
  let prisma: PrismaClient;
  let s: string;
  const sec = (n: number) => `Sector carga ${s} ${String(n)}`;
  const car = (n: number) => `Carrera carga ${s} ${String(n)}`;
  const can = (n: number) => `Canal carga ${s} ${String(n)}`;
  const base = (): Hojas => ({
    sectores: [[sec(1)], [sec(2)]],
    carreras: [[sec(1), car(1)], [sec(2), car(2)]],
    asignaturas: [[car(1), 'Asignatura', 'Bases', 'BD-1'], [car(1), 'Módulo', 'Desarrollo', ''], [car(2), 'asignatura', 'Física', '']],
    canales: [[can(1), 'sí'], [can(2), 'no']],
  });
  const contar = async () => {
    const n = async (tabla: string) => Number((await conMigrador((c) => c.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabla}`))).rows[0]?.n);
    return [await n('sector'), await n('carrera'), await n('asignatura'), await n('canal')];
  };

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_API }) });
  });
  beforeEach(() => {
    s = randomUUID().slice(0, 8);
  });
  afterAll(() => prisma.$disconnect());

  it('carga una planilla válida y la segunda corrida no cambia nada', async () => {
    const r = await cargarCatalogos(prisma, await planilla(base()));
    expect(r.errores).toEqual([]);
    expect(r.aplicado).toBe(true);
    expect(r.resumen).toEqual({
      sectores: { nuevos: 2, actualizados: 0, sinCambios: 0 },
      carreras: { nuevos: 2, actualizados: 0, sinCambios: 0 },
      asignaturas: { nuevos: 3, actualizados: 0, sinCambios: 0 },
      canales: { nuevos: 2, actualizados: 0, sinCambios: 0 },
    });
    const bd = await prisma.asignatura.findFirst({ where: { nombre: 'Bases', carrera: { nombre: car(1) } } });
    expect(bd).toMatchObject({ tipo: 'ASIGNATURA', codigo: 'BD-1' });
    expect((await prisma.asignatura.findFirst({ where: { nombre: 'Desarrollo', carrera: { nombre: car(1) } } }))?.tipo).toBe('MODULO');
    expect((await prisma.canal.findUnique({ where: { nombre: can(2) } }))?.activo).toBe(false);

    const antes = await contar();
    const otra = await cargarCatalogos(prisma, await planilla(base()));
    expect(otra.aplicado).toBe(true);
    expect(Object.values(otra.resumen).map((c) => [c.nuevos, c.actualizados])).toEqual([[0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(otra.resumen.asignaturas.sinCambios).toBe(3);
    expect(await contar()).toEqual(antes);
  });

  it('actualiza lo que cambió, no borra nada y lista lo que la planilla no incluye', async () => {
    await cargarCatalogos(prisma, await planilla(base()));
    const h = base();
    h.canales = [[can(1), 'no'], [can(2), 'sí']];
    h.carreras = [[sec(2), car(1)]]; // car(1) cambia de sector; car(2) no se incluye
    h.asignaturas = [[car(1), 'Asignatura', 'Bases', 'BD-9']];
    const antes = await contar();
    const r = await cargarCatalogos(prisma, await planilla(h));
    expect(r.errores).toEqual([]);
    expect(r.resumen.canales).toEqual({ nuevos: 0, actualizados: 2, sinCambios: 0 });
    expect(r.resumen.carreras).toEqual({ nuevos: 0, actualizados: 1, sinCambios: 0 });
    expect(r.resumen.asignaturas).toEqual({ nuevos: 0, actualizados: 1, sinCambios: 0 });
    expect(r.noIncluidos).toEqual(expect.arrayContaining([{ hoja: 'Carreras', nombre: car(2) }, { hoja: 'Asignaturas', nombre: `${car(1)} / Desarrollo` }]));
    expect(await contar()).toEqual(antes);
    expect((await prisma.canal.findUnique({ where: { nombre: can(1) } }))?.activo).toBe(false);
    expect((await prisma.carrera.findUnique({ where: { nombre: car(1) }, include: { sector: true } }))?.sector.nombre).toBe(sec(2));
    expect(formatearResultado(r, false).join('\n')).toContain('No incluidos en la planilla');
  });

  it('una planilla con varios errores informa hoja y fila de cada uno y no escribe nada', async () => {
    const antes = await contar();
    const r = await cargarCatalogos(prisma, await planilla({
      // La fila 3 queda en blanco a propósito: una fila totalmente vacía no es de datos y se ignora.
      sectores: [[sec(1)], [''], [sec(1).toUpperCase()]],
      carreras: [[sec(1), car(1)], ['Sector inexistente', car(2)]],
      asignaturas: [[car(1), 'Asignatura', 'Bases', ''], [car(1), 'Otra cosa', 'X', ''], ['Carrera inexistente', 'Módulo', 'Y', ''], [car(1), 'Módulo', '', '']],
      canales: [[can(1), 'quizás'], ['', 'sí']],
    }));
    expect(r.aplicado).toBe(false);
    const mensajes = r.errores.map((e) => `${e.hoja}:${String(e.fila)}`);
    expect(mensajes).toEqual(expect.arrayContaining(['Sectores:4', 'Carreras:3', 'Asignaturas:3', 'Asignaturas:4', 'Asignaturas:5', 'Canales:2', 'Canales:3']));
    expect(r.errores.length).toBeGreaterThanOrEqual(7);
    expect(r.errores.find((e) => e.hoja === 'Sectores' && e.fila === 4)?.mensaje).toContain('repetido');
    expect(formatearResultado(r, false)[1]).toMatch(/^ {2}\w.*fila \d+:/);
    expect(await contar()).toEqual(antes);
  });

  it('rechaza una planilla sin hojas o columnas y un archivo que no es .xlsx', async () => {
    const libro = new Workbook();
    libro.addWorksheet('Sectores').addRow(['Otro nombre']);
    const r = await leerPlanilla(Buffer.from(await libro.xlsx.writeBuffer()));
    expect(r.errores.map((e) => e.mensaje)).toEqual(expect.arrayContaining([expect.stringContaining('Faltan las columnas') as string, 'Falta la hoja «Carreras».']));
    const basura = await cargarCatalogos(prisma, Buffer.from('PK\u0003\u0004 no es una planilla'));
    expect(basura.errores[0]?.mensaje).toContain('no se pudo leer');
  });

  it('--prueba valida y resume sin escribir', async () => {
    const antes = await contar();
    const r = await cargarCatalogos(prisma, await planilla(base()), { prueba: true });
    expect(r.aplicado).toBe(false);
    expect(r.errores).toEqual([]);
    expect(r.resumen.sectores.nuevos).toBe(2);
    expect(formatearResultado(r, true)[0]).toContain('Modo de prueba');
    expect(await contar()).toEqual(antes);
  });

  it('la plantilla trae los datos de ejemplo, se puede cargar y repetir sin cambios', async () => {
    const buffer = await generarPlantilla();
    const leida = await leerPlanilla(buffer);
    expect(leida.errores).toEqual([]);
    expect(leida.planilla.sectores).toHaveLength(SECTORES_EJEMPLO.length);
    expect(leida.planilla.carreras).toHaveLength(CARRERAS_EJEMPLO.length);
    expect(leida.planilla.canales).toHaveLength(CANALES_EJEMPLO.length);
    expect(leida.planilla.asignaturas).toHaveLength(CARRERAS_EJEMPLO.reduce((n, c) => n + c.asignaturas.length + c.modulos.length, 0));
    const primera = await cargarCatalogos(prisma, buffer);
    expect(primera.errores).toEqual([]);
    expect(primera.aplicado).toBe(true);
    const segunda = await cargarCatalogos(prisma, buffer);
    expect(Object.values(segunda.resumen).every((c) => c.nuevos === 0 && c.actualizados === 0)).toBe(true);
  });
});
