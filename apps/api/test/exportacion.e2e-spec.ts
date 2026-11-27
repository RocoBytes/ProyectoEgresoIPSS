import { randomUUID } from 'node:crypto';
import { Workbook, ValueType } from 'exceljs';
import type { RespuestaListadoRegistros } from '@ipss/shared';
import { hoyEnSantiago } from '../src/comun/fecha-texto';
import { ExportacionRegistrosService, MAXIMO_FILAS_EXPORTACION, TIPO_XLSX } from '../src/registros/exportacion-registros.service';
import { type AppDePruebas, conMigrador, levantarApp } from './ayudas/acceso';
import { type Escenario, cookiesDeUsuario, crearEscenario, llamar, sumarDias } from './ayudas/escenario';

const DESC = 'Descripción de prueba con más de veinte caracteres';
const ENCABEZADOS = [
  'N°', 'Año', 'Fecha de la sesión', 'Instancia', 'Canal', 'Sector', 'Carrera', 'Nivel de impacto', 'Objeto afectado', 'Recurso', 'Descripción',
  'Fecha comprometida', 'Estado', 'Vencido', 'Fecha efectiva', 'Comentario de cierre', 'Motivo de anulación', 'Registrado por', 'Registrado el',
];

describe('GET /api/registros/exportar (e2e contra PostgreSQL real)', () => {
  let ap: AppDePruebas;
  let e: Escenario;
  let hoy: string;
  let cSec: Record<string, string>;
  let cCar: Record<string, string>;
  let cCal: Record<string, string>;
  let unico: string;
  const ids: Record<string, string> = {};

  const sesion = (fecha: string, instancia: string, canal = e.canal) =>
    conMigrador(async (c) => (await c.query<{ id: string }>("INSERT INTO sesion (canal_id, fecha, instancia, participantes, creado_por) VALUES ($1, $2, $3, ARRAY['Ana'], $4) RETURNING id", [canal, fecha, instancia, e.sectorial.id])).rows[0]?.id ?? '');
  const reg = (s: string, carrera: string, nivel: string, asig: string | null, malla: string | null, recurso: string | null, descripcion: string, comprometida: string) =>
    conMigrador(async (c) => (await c.query<{ id: string }>('INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, asignatura_id, version_malla_id, recurso, descripcion, fecha_comprometida, actualizado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [s, carrera, nivel, asig, malla, recurso, descripcion, comprometida, e.sectorial.id])).rows[0]?.id ?? '');
  const exportar = (q: string, cookies = cCal) => llamar(ap.url, 'GET', `/api/registros/exportar?${q}`, { cookies });
  const leer = async (bytes: Buffer) => {
    const libro = new Workbook();
    await libro.xlsx.load(bytes as unknown as Parameters<typeof libro.xlsx.load>[0]);
    return libro;
  };
  const correlativosExportados = async (q: string): Promise<string[]> => {
    const hoja = (await leer((await exportar(q)).bytes)).getWorksheet('Registros');
    const salida: string[] = [];
    hoja?.eachRow((fila, n) => {
      if (n > 1) salida.push(fila.getCell(1).text);
    });
    return salida;
  };
  const correlativosDelListado = async (q: string): Promise<string[]> => {
    const todos: string[] = [];
    for (let pagina = 1; ; pagina += 1) {
      const r = (await llamar<RespuestaListadoRegistros>(ap.url, 'GET', `/api/registros?${q}&pagina=${String(pagina)}`, { cookies: cCal })).cuerpo;
      todos.push(...r.filas.map((f) => f.correlativo));
      if (todos.length >= r.total || r.filas.length === 0) return todos;
    }
  };

  beforeAll(async () => {
    ap = await levantarApp();
    e = await crearEscenario();
    hoy = hoyEnSantiago(ap.reloj);
    [cSec, cCar, cCal] = await Promise.all([cookiesDeUsuario(ap, e.sectorial), cookiesDeUsuario(ap, e.directorCarrera), cookiesDeUsuario(ap, e.calidad)]);
    unico = `Zq${randomUUID().slice(0, 6)}`;
    const s25 = await sesion('2025-03-10', `Comité ${unico}`);
    const s26 = await sesion('2026-05-20', 'Consejo de empresas');
    const s26b = await sesion('2026-06-02', 'Sesión de junio');
    // 25 registros repartidos en dos años, carreras de dos sectores y todos los niveles: más de dos páginas del listado.
    for (let i = 0; i < 12; i += 1) await reg(s25, i % 3 === 0 ? e.carreraA2 : e.carreraA, i % 3 === 0 ? 'PERFIL_INGRESO' : 'ASIGNATURA', i % 3 === 0 ? null : e.asignaturaA, null, null, `${DESC} ${String(i)}`, sumarDias(hoy, i - 6));
    for (let i = 0; i < 8; i += 1) await reg(s26, e.carreraA, 'RECURSO', e.asignaturaA, null, `Guía ${unico} ${String(i)}`, DESC, sumarDias(hoy, i - 3));
    ids['malla'] = await reg(s26b, e.carreraA, 'MALLA', null, e.mallaA, null, DESC, sumarDias(hoy, 5));
    ids['otra'] = await reg(s26b, e.carreraB, 'PERFIL_EGRESO', null, null, null, DESC, sumarDias(hoy, -2));
    ids['egreso'] = await reg(s26b, e.carreraA2, 'PERFIL_INGRESO', null, null, null, DESC, sumarDias(hoy, 1));
    ids['modulo'] = await reg(s26b, e.carreraA, 'MODULO', e.moduloA, null, null, DESC, sumarDias(hoy, 2));
    // Las tres primeras con valores que Excel interpretaría como fórmula, un cierre y una anulación.
    ids['formula'] = await reg(s26b, e.carreraA, 'PERFIL_EGRESO', null, null, null, '=HYPERLINK("http://ejemplo.invalid","clic")', sumarDias(hoy, 9));
    await reg(s26b, e.carreraA2, 'PERFIL_EGRESO', null, null, null, '+SUMA(1;2) como descripción larga', sumarDias(hoy, 9));
    await reg(s26b, e.carreraA, 'PERFIL_EGRESO', null, null, null, '-2+3 como descripción de prueba', sumarDias(hoy, 9));
    await reg(s26b, e.carreraA, 'PERFIL_EGRESO', null, null, null, '@SUMA(A1) como descripción de prueba', sumarDias(hoy, 9));
    await conMigrador(async (c) => {
      const ev = (await c.query<{ id: string }>("INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ('c.pdf','application/pdf',1,$1,$2,$3) RETURNING id", ['0'.repeat(64), randomUUID(), e.sectorial.id])).rows[0]?.id;
      await c.query("UPDATE registro SET estado='CERRADO', fecha_efectiva=$2, evidencia_cierre_id=$3, comentario_cierre='=cmd|calc' WHERE id=$1", [ids['modulo'], hoy, ev]);
      await c.query("UPDATE registro SET estado='ANULADO', motivo_anulacion='@motivo con arroba' WHERE id=$1", [ids['egreso']]);
    });
  });
  afterAll(() => ap.app.close());

  const base = () => `canalId=${e.canal}`;

  it('las filas exportadas son las del listado, en el mismo orden, para varias combinaciones de filtros', async () => {
    const combinaciones = [
      base(),
      `${base()}&anio=2026`,
      `${base()}&anio=2025`,
      `${base()}&estado=VENCIDO`,
      `${base()}&estado=ABIERTO&anio=2026`,
      `${base()}&estado=CERRADO`,
      `${base()}&estado=ANULADO`,
      `${base()}&q=${encodeURIComponent(unico.toLowerCase())}`,
      `${base()}&q=${encodeURIComponent('bases de datos')}&estado=VENCIDO`,
      `${base()}&sectorId=${e.sectorB}`,
      `${base()}&carreraId=${e.carreraA2}&nivel=PERFIL_INGRESO`,
      `${base()}&nivel=MALLA`,
      `${base()}&q=${encodeURIComponent('%')}`,
    ];
    for (const q of combinaciones) {
      const esperado = await correlativosDelListado(q);
      expect({ q, filas: await correlativosExportados(q) }).toEqual({ q, filas: esperado });
    }
    // Hay más de una página en el listado completo y el filtro VENCIDO no devuelve todo.
    expect((await correlativosDelListado(base())).length).toBeGreaterThan(20);
    expect((await correlativosDelListado(`${base()}&estado=VENCIDO`)).length).toBeGreaterThan(0);
    expect((await correlativosDelListado(`${base()}&estado=VENCIDO`)).length).toBeLessThan((await correlativosDelListado(base())).length);
  });

  it('la pagina que pida el cliente no recorta la exportación', async () => {
    expect((await correlativosExportados(`${base()}&pagina=2`)).length).toBe((await correlativosDelListado(base())).length);
  });

  it('trae las cabeceras, el nombre con o sin año, la hoja con encabezado en negrita y paneles congelados', async () => {
    const con = await exportar(`${base()}&anio=2026`);
    expect(con.estado).toBe(200);
    expect(con.cabeceras.get('content-type')).toBe(TIPO_XLSX);
    expect(con.cabeceras.get('content-disposition')).toBe('attachment; filename="registros-2026.xlsx"');
    expect(con.cabeceras.get('cache-control')).toBe('private, no-store');
    expect((await exportar(base())).cabeceras.get('content-disposition')).toBe('attachment; filename="registros-todos.xlsx"');

    const libro = await leer(con.bytes);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Registros']);
    const hoja = libro.getWorksheet('Registros');
    expect(hoja?.getRow(1).values).toEqual([undefined, ...ENCABEZADOS]);
    expect(hoja?.getRow(1).font?.bold).toBe(true);
    expect(hoja?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('escribe fechas dd-mm-aaaa, objeto, estado, vencido y marcas en Santiago', async () => {
    const hoja = (await leer((await exportar(`${base()}&carreraId=${e.carreraB}`)).bytes)).getWorksheet('Registros');
    const fila = hoja?.getRow(2);
    expect(fila?.getCell(2).value).toBe(2026);
    expect(fila?.getCell(3).value).toBe('02-06-2026');
    expect(fila?.getCell(4).value).toBe('Sesión de junio');
    expect(fila?.getCell(7).value).toBe(e.nombreCarreraB);
    expect(fila?.getCell(8).value).toBe('Perfil de egreso');
    expect(fila?.getCell(9).value).toBe(`Perfil de egreso de ${e.nombreCarreraB}`);
    expect(fila?.getCell(12).value).toBe(sumarDias(hoy, -2).split('-').reverse().join('-'));
    expect(fila?.getCell(13).value).toBe('Abierto');
    expect(fila?.getCell(14).value).toBe('Sí');
    expect(fila?.getCell(18).value).toBe(e.sectorial.nombre);
    expect(fila?.getCell(19).text).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/);
    // Cerrado y anulado traen sus campos propios.
    const cerrados = (await leer((await exportar(`${base()}&estado=CERRADO`)).bytes)).getWorksheet('Registros')?.getRow(2);
    expect(cerrados?.getCell(13).value).toBe('Cerrado');
    expect(cerrados?.getCell(14).value).toBe('No');
    expect(cerrados?.getCell(15).value).toBe(hoy.split('-').reverse().join('-'));
  });

  it('un texto que empieza por = + - o @ sale como texto, nunca como fórmula', async () => {
    const hoja = (await leer((await exportar(`${base()}&anio=2026`)).bytes)).getWorksheet('Registros');
    const textos = new Map<string, ReturnType<NonNullable<typeof hoja>['getCell']>>();
    hoja?.eachRow((fila, n) => {
      if (n > 1) {
        for (const columna of [11, 16, 17]) {
          const celda = fila.getCell(columna);
          if (typeof celda.value === 'string' && /^[=+\-@]/.test(celda.value)) textos.set(celda.value, celda);
        }
      }
    });
    expect([...textos.keys()].sort()).toEqual(['+SUMA(1;2) como descripción larga', '-2+3 como descripción de prueba', '=HYPERLINK("http://ejemplo.invalid","clic")', '=cmd|calc', '@SUMA(A1) como descripción de prueba', '@motivo con arroba'].sort());
    for (const celda of textos.values()) {
      expect(celda.type).toBe(ValueType.String);
      expect(celda.formula).toBeUndefined();
    }
    // Ninguna celda de toda la hoja es fórmula.
    hoja?.eachRow((fila) => fila.eachCell((celda) => expect(celda.type).not.toBe(ValueType.Formula)));
  });

  it('es una foto consistente: crear o cerrar registros entre lotes no duplica ni omite filas', async () => {
    const servicio = ap.app.get(ExportacionRegistrosService);
    const consulta = `${base()}&estado=ABIERTO`;
    const foto = await correlativosDelListado(consulta);
    expect(foto.length).toBeGreaterThan(9);
    const nuevos: string[] = [];
    const sesionNueva = await sesion('2026-07-01', 'Sesión creada durante la exportación');
    try {
      servicio.tamanoLote = 4;
      let lotes = 0;
      servicio.despuesDeCadaLote = async (lote) => {
        lotes = lote;
        if (lote !== 1) return;
        // Después del primer lote: dos registros nuevos que ordenan ANTES de todo lo ya leído (correrían las páginas
        // hacia abajo y repetirían filas) y un cierre de uno que todavía no se leyó (las correría hacia arriba y omitiría una).
        nuevos.push(await reg(sesionNueva, e.carreraA, 'PERFIL_EGRESO', null, null, null, DESC, sumarDias(hoy, 20)));
        nuevos.push(await reg(sesionNueva, e.carreraA, 'PERFIL_EGRESO', null, null, null, DESC, sumarDias(hoy, 21)));
        await conMigrador(async (c) => {
          const ev = (await c.query<{ id: string }>("INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ('c.pdf','application/pdf',1,$1,$2,$3) RETURNING id", ['0'.repeat(64), randomUUID(), e.sectorial.id])).rows[0]?.id;
          await c.query("UPDATE registro SET estado='CERRADO', fecha_efectiva=$2, evidencia_cierre_id=$3 WHERE id = (SELECT r.id FROM registro r JOIN sesion s ON s.id = r.sesion_id WHERE s.canal_id = $1 AND r.estado = 'ABIERTO' AND r.correlativo = $4)", [e.canal, hoy, ev, foto[foto.length - 1]]);
        });
      };
      const exportados = await correlativosExportados(consulta);
      expect(lotes).toBeGreaterThan(1);
      expect(nuevos).toHaveLength(2);
      expect(exportados).toEqual(foto);
      expect(new Set(exportados).size).toBe(exportados.length);
    } finally {
      servicio.tamanoLote = 1000;
      servicio.despuesDeCadaLote = undefined;
    }
    // Lo que cambió durante la exportación sí aparece en la siguiente.
    const despues = await correlativosDelListado(consulta);
    expect(despues).not.toEqual(foto);
    expect(await correlativosExportados(consulta)).toEqual(despues);
  });

  it('responde 400 antes de escribir si el resultado supera el máximo, y deja pasar exactamente el máximo', async () => {
    const servicio = ap.app.get(ExportacionRegistrosService);
    const total = (await correlativosDelListado(base())).length;
    expect(servicio.maximoFilas).toBe(MAXIMO_FILAS_EXPORTACION);
    try {
      servicio.maximoFilas = total - 1;
      const r = await exportar(base());
      expect(r.estado).toBe(400);
      expect(r.cabeceras.get('content-type')).not.toBe(TIPO_XLSX);
      expect(r.cabeceras.get('content-disposition')).toBeNull();
      expect((r.cuerpo as { message: string }).message).toContain('Acota los filtros');
      servicio.maximoFilas = total;
      expect((await exportar(base())).estado).toBe(200);
    } finally {
      servicio.maximoFilas = MAXIMO_FILAS_EXPORTACION;
    }
  });

  it('exige sesión y responde 200 a los tres perfiles; un filtro inválido da 400', async () => {
    expect((await llamar(ap.url, 'GET', `/api/registros/exportar?${base()}`)).estado).toBe(401);
    for (const c of [cSec, cCar, cCal]) expect((await exportar(base(), c)).estado).toBe(200);
    expect((await exportar('anio=abc')).estado).toBe(400);
    expect((await exportar('sectorId=no-es-uuid')).estado).toBe(400);
  });
});
