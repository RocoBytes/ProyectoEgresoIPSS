import { randomUUID } from 'node:crypto';
import type { RespuestaPanel } from '@ipss/shared';
import { hoyEnSantiago } from '../src/comun/fecha-texto';
import { type AppDePruebas, conMigrador, levantarApp } from './ayudas/acceso';
import { type Escenario, cookiesDeUsuario, crearEscenario, llamar, sumarDias } from './ayudas/escenario';

// Años lejanos: otras suites dejan datos en la misma base y aquí cada cifra debe ser exacta.
const ANIO = 2042;
const PREVIO = 2041;
const VACIO = 2043;
const CARGA = 2044;
const DESC = 'Descripción de prueba con más de veinte caracteres';

describe('GET /api/reportes/panel', () => {
  let ap: AppDePruebas;
  let e: Escenario;
  let hoy: string;
  let cSec: Record<string, string>;
  let cCar: Record<string, string>;
  let cCal: Record<string, string>;
  let canalAlfa: string;
  let canalBeta: string;
  const r: Record<string, string> = {};
  const sesiones: string[] = [];

  const sesion = async (fecha: string, canal: string, instancia: string): Promise<string> =>
    conMigrador(async (c) => (await c.query<{ id: string }>("INSERT INTO sesion (canal_id, fecha, instancia, participantes, creado_por) VALUES ($1, $2, $3, ARRAY['Ana'], $4) RETURNING id", [canal, fecha, instancia, e.sectorial.id])).rows[0]?.id ?? '');

  type Estado = 'ABIERTO' | 'CERRADO' | 'ANULADO';
  const registro = (s: string, carrera: string, nivel: string, estado: Estado, comprometida: string, efectiva?: string): Promise<string> =>
    conMigrador(async (c) => {
      const asig = nivel === 'ASIGNATURA' ? e.asignaturaA : null;
      const malla = nivel === 'MALLA' ? e.mallaB : null;
      const id = (await c.query<{ id: string }>('INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, asignatura_id, version_malla_id, descripcion, fecha_comprometida, actualizado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [s, carrera, nivel, asig, malla, DESC, comprometida, e.sectorial.id])).rows[0]?.id ?? '';
      if (estado === 'CERRADO') {
        const ev = (await c.query<{ id: string }>("INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ('c.pdf','application/pdf',1,$1,$2,$3) RETURNING id", ['0'.repeat(64), randomUUID(), e.sectorial.id])).rows[0]?.id;
        await c.query("UPDATE registro SET estado='CERRADO', fecha_efectiva=$2, evidencia_cierre_id=$3 WHERE id=$1", [id, efectiva, ev]);
      } else if (estado === 'ANULADO') {
        await c.query("UPDATE registro SET estado='ANULADO', motivo_anulacion='Duplicado de prueba' WHERE id=$1", [id]);
      }
      return id;
    });

  const panel = async (consulta: string, cookies = cCal) => llamar<RespuestaPanel>(ap.url, 'GET', `/api/reportes/panel?${consulta}`, { cookies });
  const sector = (extra = '', anio = ANIO) => `anio=${anio}&sectorId=${e.sectorA}${extra}`;

  beforeAll(async () => {
    ap = await levantarApp();
    e = await crearEscenario();
    hoy = hoyEnSantiago(ap.reloj);
    [cSec, cCar, cCal] = await Promise.all([cookiesDeUsuario(ap, e.sectorial), cookiesDeUsuario(ap, e.directorCarrera), cookiesDeUsuario(ap, e.calidad)]);
    // «Beta» se crea primero: el orden de la respuesta es alfabético, no el de inserción.
    const s = randomUUID().slice(0, 6);
    const canal = (nombre: string) => conMigrador(async (c) => (await c.query<{ id: string }>('INSERT INTO canal (nombre) VALUES ($1) RETURNING id', [nombre])).rows[0]?.id ?? '');
    canalBeta = await canal(`Beta ${s}`);
    canalAlfa = await canal(`Alfa ${s}`);
    await canal(`Sin uso ${s}`);

    // Sector A en 2042.
    const sA = await sesion(`${ANIO}-01-10`, canalAlfa, 'Sesión de enero');
    sesiones.push(sA);
    r['vencido'] = await registro(sA, e.carreraA, 'PERFIL_EGRESO', 'ABIERTO', sumarDias(hoy, -1));
    r['hoy'] = await registro(sA, e.carreraA, 'PERFIL_EGRESO', 'ABIERTO', hoy);
    r['enPlazo'] = await registro(sA, e.carreraA2, 'PERFIL_INGRESO', 'CERRADO', `${ANIO}-02-01`, `${ANIO}-02-01`);
    r['tarde'] = await registro(sA, e.carreraA, 'ASIGNATURA', 'CERRADO', `${ANIO}-01-20`, `${ANIO}-01-25`);
    r['anulado'] = await registro(sA, e.carreraA, 'PERFIL_INGRESO', 'ANULADO', sumarDias(hoy, 3));
    for (const [i, mes] of ['04', '05', '06', '07', '08'].entries()) {
      // La primera va por Beta; el resto por Alfa.
      const id = await sesion(`${ANIO}-${mes}-01`, i === 0 ? canalBeta : canalAlfa, `Sesión ${mes}`);
      sesiones.push(id);
      await registro(id, e.carreraA2, 'PERFIL_EGRESO', 'ABIERTO', sumarDias(hoy, 5));
    }
    // Sector B en 2042 y el año anterior.
    const sB = await sesion(`${ANIO}-03-05`, canalBeta, 'Sesión del sector B');
    await registro(sB, e.carreraB, 'PERFIL_EGRESO', 'ABIERTO', sumarDias(hoy, 10));
    await registro(sB, e.carreraB, 'MALLA', 'CERRADO', `${ANIO}-04-01`, `${ANIO}-03-30`);
    // El 31 de diciembre de 2041 pertenece a 2041 y a diciembre, aunque su correlativo sea del año en curso.
    const sP = await sesion(`${PREVIO}-12-31`, canalAlfa, 'Cierre de año');
    await registro(sP, e.carreraA, 'PERFIL_EGRESO', 'ABIERTO', sumarDias(hoy, 1));
    await registro(sP, e.carreraA2, 'PERFIL_EGRESO', 'ABIERTO', sumarDias(hoy, 1));
  });
  afterAll(() => ap.app.close());

  it('cuenta por estado: vencido es estricto, vigentes excluye anulados y enPlazo compara fechas', async () => {
    const { estado, cuerpo } = await panel(sector());
    expect(estado).toBe(200);
    expect(cuerpo.anio).toBe(ANIO);
    expect(cuerpo.hoy).toBe(hoy);
    expect(cuerpo.indicadores).toEqual({
      total: 10, abiertos: 7, vencidos: 1, cerrados: 2, anulados: 1, vigentes: 9, enPlazo: 1,
      carrerasConAjustes: 2, carrerasEnAlcance: 2, totalAnioAnterior: 2,
    });
  });

  it('reparte por mes de la sesión y por año, con anulados, y el 31 de diciembre queda en su año', async () => {
    const { cuerpo } = await panel(sector());
    expect(cuerpo.porMes).toHaveLength(12);
    expect(cuerpo.porMes[0]).toEqual({ mes: 1, cerrados: 2, abiertos: 2, anulados: 1, total: 5 });
    expect(cuerpo.porMes.map((m) => m.total)).toEqual([5, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    const previo = cuerpo.porAnio.find((a) => a.anio === PREVIO);
    expect(previo?.total).toBe(2);
    expect(previo?.meses[11]).toBe(2);
    expect(cuerpo.porAnio.find((a) => a.anio === ANIO)?.total).toBe(10);
    expect(cuerpo.porAnio.map((a) => a.anio)).toEqual(cuerpo.aniosDisponibles);
    expect(cuerpo.aniosDisponibles).toEqual([...cuerpo.aniosDisponibles].sort((a, b) => b - a));
    expect(cuerpo.aniosDisponibles).toEqual(expect.arrayContaining([ANIO, PREVIO]));
    // Los años disponibles no dependen de los filtros.
    const otro = await panel(`anio=${ANIO}&sectorId=${e.sectorB}`);
    expect(otro.cuerpo.aniosDisponibles).toEqual(cuerpo.aniosDisponibles);
  });

  it('porCanal y porNivel traen solo filas con ajustes, en orden alfabético y en el del enumerado', async () => {
    const { cuerpo } = await panel(sector());
    expect(cuerpo.porCanal.map((c) => [c.id, c.total])).toEqual([[canalAlfa, 9], [canalBeta, 1]]);
    expect(cuerpo.porNivel).toEqual([
      { nivel: 'ASIGNATURA', total: 1 },
      { nivel: 'PERFIL_INGRESO', total: 2 },
      { nivel: 'PERFIL_EGRESO', total: 7 },
    ]);
  });

  it('porGrupo: por sector sin filtro de sector y por carrera con él; la carrera sigue filtrando', async () => {
    const todos = (await panel(`anio=${ANIO}`)).cuerpo.porGrupo.filter((g) => [e.sectorA, e.sectorB].includes(g.id));
    expect(todos.map((g) => [g.tipo, g.id, g.total])).toEqual([['SECTOR', e.sectorA, 10], ['SECTOR', e.sectorB, 2]]);

    const { cuerpo } = await panel(sector());
    expect(cuerpo.porGrupo.every((g) => g.tipo === 'CARRERA')).toBe(true);
    const nombres = cuerpo.porGrupo.map((g) => g.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    expect(cuerpo.porGrupo.find((g) => g.id === e.carreraA)).toMatchObject({ cerrados: 1, abiertos: 2, anulados: 1, total: 4 });
    expect(cuerpo.porGrupo.find((g) => g.id === e.carreraA2)).toMatchObject({ cerrados: 1, abiertos: 5, anulados: 0, total: 6 });

    const soloCarrera = await panel(sector(`&carreraId=${e.carreraA2}`));
    expect(soloCarrera.cuerpo.porGrupo.map((g) => [g.tipo, g.id, g.total])).toEqual([['CARRERA', e.carreraA2, 6]]);
    expect(soloCarrera.cuerpo.indicadores).toMatchObject({ total: 6, carrerasConAjustes: 1, carrerasEnAlcance: 1 });
    // Una carrera sin sector: el agrupador sigue siendo el sector.
    const sinSector = await panel(`anio=${ANIO}&carreraId=${e.carreraA2}`);
    expect(sinSector.cuerpo.porGrupo.map((g) => [g.tipo, g.id, g.total])).toEqual([['SECTOR', e.sectorA, 6]]);
  });

  it('últimas sesiones: máximo 5, de la más reciente a la más antigua, con ajustes filtrados y primer registro', async () => {
    const { cuerpo } = await panel(sector());
    expect(cuerpo.ultimasSesiones).toHaveLength(5);
    expect(cuerpo.ultimasSesiones.map((s) => s.fecha)).toEqual([`${ANIO}-08-01`, `${ANIO}-07-01`, `${ANIO}-06-01`, `${ANIO}-05-01`, `${ANIO}-04-01`]);
    expect(cuerpo.ultimasSesiones.map((s) => s.id)).toEqual([...sesiones.slice(1)].reverse());
    expect(cuerpo.ultimasSesiones[4]).toMatchObject({ instancia: 'Sesión 04', ajustes: 1 });

    const soloA = (await panel(sector(`&carreraId=${e.carreraA}`))).cuerpo.ultimasSesiones;
    expect(soloA).toHaveLength(1);
    expect(soloA[0]).toEqual({ id: sesiones[0], fecha: `${ANIO}-01-10`, instancia: 'Sesión de enero', canal: expect.any(String) as string, creadoPor: e.sectorial.nombre, ajustes: 4, primerRegistroId: r['vencido'] });
    const soloA2 = (await panel(`anio=${ANIO}&carreraId=${e.carreraA2}&sectorId=${e.sectorA}`)).cuerpo.ultimasSesiones;
    expect(soloA2.map((s) => s.id)).not.toContain(sesiones[0]);
  });

  it('un año sin datos devuelve ceros y listas vacías; sin año usa el actual o el más reciente', async () => {
    const { cuerpo } = await panel(sector('', VACIO));
    expect(cuerpo.anio).toBe(VACIO);
    expect(cuerpo.indicadores).toEqual({
      total: 0, abiertos: 0, vencidos: 0, cerrados: 0, anulados: 0, vigentes: 0, enPlazo: 0,
      carrerasConAjustes: 0, carrerasEnAlcance: 2, totalAnioAnterior: 10,
    });
    expect(cuerpo.porMes).toHaveLength(12);
    expect(cuerpo.porMes.every((m) => m.total === 0)).toBe(true);
    expect([cuerpo.porCanal, cuerpo.porNivel, cuerpo.porGrupo, cuerpo.ultimasSesiones]).toEqual([[], [], [], []]);
    // Sin ajustes en el año anterior ni en todo el sistema: «Primer año con ajustes».
    expect((await panel(sector('', 2040))).cuerpo.indicadores.totalAnioAnterior).toBeNull();

    const porDefecto = (await panel(`sectorId=${e.sectorA}`)).cuerpo;
    const actual = Number(hoy.slice(0, 4));
    expect(porDefecto.anio).toBe(porDefecto.aniosDisponibles.includes(actual) ? actual : porDefecto.aniosDisponibles[0]);
  });

  it('responde 400 con parámetros inválidos, 401 sin sesión y 200 a los tres perfiles', async () => {
    for (const q of ['anio=abc', 'anio=1999', 'anio=2101', 'anio=2042.5', 'sectorId=no-es-uuid', 'carreraId=1']) {
      const respuesta = await panel(q);
      expect(respuesta.estado).toBe(400);
      expect(respuesta.cuerpo).toMatchObject({ statusCode: 400, errores: [expect.objectContaining({ mensaje: expect.any(String) as string })] });
    }
    // Un filtro vacío equivale a no filtrar.
    expect((await panel(`anio=${ANIO}&sectorId=&carreraId=`)).estado).toBe(200);
    expect((await llamar(ap.url, 'GET', `/api/reportes/panel?anio=${ANIO}`)).estado).toBe(401);
    for (const cookies of [cSec, cCar, cCal]) expect((await panel(`anio=${ANIO}`, cookies)).estado).toBe(200);
  });

  it('con 1.000 registros responde en menos de 1 s', async () => {
    await conMigrador(async (c) => {
      const s = (await c.query<{ id: string }>("INSERT INTO sesion (canal_id, fecha, instancia, participantes, creado_por) VALUES ($1, $2, 'Carga', ARRAY['Ana'], $3) RETURNING id", [canalAlfa, `${CARGA}-06-01`, e.sectorial.id])).rows[0]?.id;
      // Con el trigger del correlativo encendido, 1.000 registros agotarían el contador del año y romperían la suite del correlativo.
      await c.query('ALTER TABLE registro DISABLE TRIGGER registro_correlativo');
      try {
        await c.query("INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, asignatura_id, descripcion, fecha_comprometida, actualizado_por, anio, numero, correlativo) SELECT $1, $2, 'ASIGNATURA', $3, 'Registro de carga número ' || g, '2044-12-01', $4, $5::int, g, 'R-' || $5::text || '-' || g FROM generate_series(1, 1000) g", [s, e.carreraA, e.asignaturaA, e.sectorial.id, 10_000 + Math.floor(Math.random() * 900_000)]);
      } finally {
        await c.query('ALTER TABLE registro ENABLE TRIGGER registro_correlativo');
      }
    });
    const inicio = performance.now();
    const { estado, cuerpo } = await panel(sector('', CARGA));
    const ms = performance.now() - inicio;
    expect(estado).toBe(200);
    expect(cuerpo.indicadores.total).toBe(1000);
    expect(ms).toBeLessThan(1000);
  });
});
