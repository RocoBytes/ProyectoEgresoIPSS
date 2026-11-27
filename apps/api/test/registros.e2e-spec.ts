import { randomUUID } from 'node:crypto';
import type { DetalleRegistro, RespuestaListadoRegistros } from '@ipss/shared';
import { hoyEnSantiago } from '../src/comun/fecha-texto';
import { type AppDePruebas, conMigrador, levantarApp } from './ayudas/acceso';
import { type Escenario, cookiesDeUsuario, crearEscenario, llamar, sumarDias } from './ayudas/escenario';

const DESC = 'Descripción de prueba con más de veinte caracteres';

describe('registros: listado, años, detalle y edición', () => {
  let ap: AppDePruebas;
  let e: Escenario;
  let hoy: string;
  let cSec: Record<string, string>;
  let cCar: Record<string, string>;
  let cCal: Record<string, string>;
  const ids: Record<string, string> = {};
  let sesionId: string;
  let sesion2: string;
  let unico: string;

  const sesion = (fecha: string, instancia: string) =>
    conMigrador(async (c) => (await c.query<{ id: string }>("INSERT INTO sesion (canal_id, fecha, instancia, participantes, creado_por) VALUES ($1, $2, $3, ARRAY['Ana','Luis'], $4) RETURNING id", [e.canal, fecha, instancia, e.sectorial.id])).rows[0]?.id ?? '');
  const reg = (s: string, carrera: string, nivel: string, asig: string | null, malla: string | null, recurso: string | null, descripcion: string, comprometida: string) =>
    conMigrador(async (c) => (await c.query<{ id: string }>('INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, asignatura_id, version_malla_id, recurso, descripcion, fecha_comprometida, actualizado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [s, carrera, nivel, asig, malla, recurso, descripcion, comprometida, e.sectorial.id])).rows[0]?.id ?? '');
  const listar = async (q: string, cookies = cCal) => (await llamar<RespuestaListadoRegistros>(ap.url, 'GET', `/api/registros?${q}`, { cookies })).cuerpo;
  const idsDe = (r: RespuestaListadoRegistros) => r.filas.map((f) => f.id);

  beforeAll(async () => {
    ap = await levantarApp();
    e = await crearEscenario();
    hoy = hoyEnSantiago(ap.reloj);
    [cSec, cCar, cCal] = await Promise.all([cookiesDeUsuario(ap, e.sectorial), cookiesDeUsuario(ap, e.directorCarrera), cookiesDeUsuario(ap, e.calidad)]);
    unico = `Zq${randomUUID().slice(0, 6)}`;
    sesionId = await sesion('2025-03-10', `Comité ${unico}`);
    sesion2 = await sesion('2026-05-20', 'Consejo de empresas');
    ids['vencido'] = await reg(sesionId, e.carreraA, 'ASIGNATURA', e.asignaturaA, null, null, DESC, sumarDias(hoy, -1));
    ids['hoy'] = await reg(sesionId, e.carreraA, 'RECURSO', e.asignaturaA, null, `Guía ${unico}`, DESC, hoy);
    ids['malla'] = await reg(sesion2, e.carreraA, 'MALLA', null, e.mallaA, null, `Detalle 100% literal_`, sumarDias(hoy, 10));
    ids['literal'] = await reg(sesion2, e.carreraA2, 'PERFIL_INGRESO', null, null, null, 'Ruta C:\\datos\\x con guion_bajo literal', sumarDias(hoy, 10));
    ids['otra'] = await reg(sesion2, e.carreraB, 'PERFIL_EGRESO', null, null, null, DESC, sumarDias(hoy, 10));
    ids['cerrado'] = await reg(sesion2, e.carreraA, 'MODULO', e.moduloA, null, null, DESC, sumarDias(hoy, -20));
    await conMigrador(async (c) => {
      const ev = (await c.query<{ id: string }>("INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ('c.pdf','application/pdf',1,$1,$2,$3) RETURNING id", ['0'.repeat(64), randomUUID(), e.sectorial.id])).rows[0]?.id;
      await c.query("UPDATE registro SET estado='CERRADO', fecha_efectiva=$2, evidencia_cierre_id=$3 WHERE id=$1", [ids['cerrado'], hoy, ev]);
    });
  });
  afterAll(() => ap.app.close());

  const filtroCarrera = () => `carreraId=${e.carreraA}`;

  it('filtra por carrera, sector, asignatura, canal, nivel y año de la sesión', async () => {
    expect((await listar(filtroCarrera())).total).toBe(4);
    expect(idsDe(await listar(`sectorId=${e.sectorB}`))).toEqual([ids['otra']]);
    expect(idsDe(await listar(`${filtroCarrera()}&asignaturaId=${e.asignaturaA}`)).sort()).toEqual([ids['vencido'], ids['hoy']].sort());
    expect((await listar(`canalId=${e.canal}`)).total).toBe(6);
    expect(idsDe(await listar(`${filtroCarrera()}&nivel=MALLA`))).toEqual([ids['malla']]);
    expect((await listar(`canalId=${e.canal}&anio=2025`)).total).toBe(2);
  });

  it('estado: VENCIDO es abierto con fecha anterior a hoy; comprometida = hoy no vence; ABIERTO incluye vencidos', async () => {
    expect(idsDe(await listar(`${filtroCarrera()}&estado=VENCIDO`))).toEqual([ids['vencido']]);
    const abiertos = await listar(`${filtroCarrera()}&estado=ABIERTO`);
    expect(idsDe(abiertos).sort()).toEqual([ids['vencido'], ids['hoy'], ids['malla']].sort());
    expect(abiertos.filas.find((f) => f.id === ids['hoy'])?.vencido).toBe(false);
    expect(abiertos.filas.find((f) => f.id === ids['vencido'])?.vencido).toBe(true);
    expect(idsDe(await listar(`${filtroCarrera()}&estado=CERRADO`))).toEqual([ids['cerrado']]);
    expect((await listar(`${filtroCarrera()}&estado=ANULADO`)).total).toBe(0);
    // El reloj manda: un día después, el que vencía hoy ya está vencido.
    ap.reloj.avanzar(24 * 3_600_000);
    // Con el reloj un día adelante el JWT original ya venció: se ingresa de nuevo.
    const cookiesManana = await cookiesDeUsuario(ap, e.calidad);
    expect(idsDe(await listar(`${filtroCarrera()}&estado=VENCIDO`, cookiesManana)).sort()).toEqual([ids['vencido'], ids['hoy']].sort());
    ap.reloj.avanzar(-24 * 3_600_000);
  });

  it('búsqueda sin distinguir mayúsculas en cada campo y con % y _ literales', async () => {
    const q = (t: string) => listar(`${filtroCarrera()}&q=${encodeURIComponent(t)}`).then(idsDe);
    expect(await q(unico.toLowerCase())).toEqual(expect.arrayContaining([ids['vencido'], ids['hoy']])); // instancia y recurso
    expect(await q('bases de datos')).toEqual(expect.arrayContaining([ids['vencido']])); // asignatura
    expect(await q('carrera a')).toHaveLength(4); // carrera
    expect(await q('R-')).toHaveLength(4); // correlativo
    expect(await q('DESCRIPCIÓN DE PRUEBA')).toContain(ids['vencido']); // descripción
    expect(await q('100% literal_')).toEqual([ids['malla']]);
    expect(await q('%')).toEqual([ids['malla']]); // un % suelto no es comodín
    expect(await q('_')).toEqual([ids['malla']]);
    const enA2 = (await listar(`carreraId=${e.carreraA2}&q=${encodeURIComponent('guion_bajo')}`)).filas.map((f) => f.id);
    expect(enA2).toEqual([ids['literal']]);
    expect(idsDe(await listar(`carreraId=${e.carreraA2}&q=${encodeURIComponent('guion\\bajo')}`))).toEqual([]);
    expect(idsDe(await listar(`carreraId=${e.carreraA2}&q=${encodeURIComponent('C:\\datos\\x')}`))).toEqual([ids['literal']]);
    expect(idsDe(await listar(`carreraId=${e.carreraA2}&q=${encodeURIComponent('guion%bajo')}`))).toEqual([]);
  });

  it('pagina de 10 en 10, de la sesión más reciente a la más antigua', async () => {
    await conMigrador((c) => c.query("INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, descripcion, fecha_comprometida, actualizado_por) SELECT $1, $2, 'PERFIL_INGRESO', 'Registro masivo de prueba', '2027-01-01', $3 FROM generate_series(1, 12)", [sesion2, e.carreraA2, e.sectorial.id]));
    const p1 = await listar(`carreraId=${e.carreraA2}`);
    expect(p1).toMatchObject({ total: 13, pagina: 1, porPagina: 10 });
    expect(p1.filas).toHaveLength(10);
    const p2 = await listar(`carreraId=${e.carreraA2}&pagina=2`);
    expect(p2.filas).toHaveLength(3);
    const orden = (await listar(`canalId=${e.canal}`)).filas.map((f) => f.sesion.fecha);
    expect(orden).toEqual([...orden].sort().reverse());
    expect((await llamar(ap.url, 'GET', '/api/registros?pagina=0', { cookies: cCal })).estado).toBe(400);
  });

  it.each(['1e300', '100001', '0', '1.5', 'abc'])('pagina=%s responde 400', async (pagina) => {
    const r = await llamar(ap.url, 'GET', `/api/registros?pagina=${pagina}`, { cookies: cCal });
    expect(r.estado).toBe(400);
  });

  it('años de las sesiones con registros, de mayor a menor', async () => {
    const r = await llamar<number[]>(ap.url, 'GET', '/api/registros/anios', { cookies: cCal });
    expect(r.cuerpo).toEqual(expect.arrayContaining([2026, 2025]));
    expect(r.cuerpo).toEqual([...r.cuerpo].sort((a, b) => b - a));
  });

  it('con 1.000 registros, un listado filtrado y con búsqueda responde en menos de 1 s', async () => {
    const s = await sesion('2026-06-01', 'Carga');
    // La carga se inserta con el trigger del correlativo apagado y numeración propia: el trigger
    // actual da el mismo R-AAAA-999 a partir del registro 1.000 del año (lpad recorta a 3 cifras).
    await conMigrador(async (c) => {
      await c.query('ALTER TABLE registro DISABLE TRIGGER registro_correlativo');
      try {
        await c.query("INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, asignatura_id, descripcion, fecha_comprometida, actualizado_por, anio, numero, correlativo) SELECT $1, $2, 'ASIGNATURA', $3, 'Registro de carga número ' || g, '2027-02-01', $4, $5::int, g, 'R-' || $5::text || '-' || g FROM generate_series(1, 1000) g", [s, e.carreraA, e.asignaturaA2, e.sectorial.id, 10_000 + Math.floor(Math.random() * 900_000)]);
      } finally {
        await c.query('ALTER TABLE registro ENABLE TRIGGER registro_correlativo');
      }
    });
    const t = Date.now();
    const r = await listar(`carreraId=${e.carreraA}&estado=ABIERTO&anio=2026&q=${encodeURIComponent('Número 99')}`);
    const ms = Date.now() - t;
    expect(r.total).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });

  describe('detalle', () => {
    it('trae sesión, otros registros, permisos y el historial con la edición', async () => {
      expect((await llamar(ap.url, 'PATCH', `/api/registros/${ids['hoy']}`, { cookies: cSec, json: { descripcion: 'Nueva descripción con más de veinte letras' } })).estado).toBe(200);
      const r = await llamar<DetalleRegistro>(ap.url, 'GET', `/api/registros/${ids['hoy']}`, { cookies: cSec });
      expect(r.estado).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- los asimétricos de Jest devuelven any
      expect(r.cuerpo).toMatchObject({ estado: 'ABIERTO', vencido: false, objeto: expect.stringMatching(/ · Guía /), fechaEfectiva: null, permisos: { puedeModificar: true }, sesion: { fecha: '2025-03-10', participantes: ['Ana', 'Luis'], creadoPor: e.sectorial.nombre } });
      expect(r.cuerpo.sesion.evidencias).toEqual({ acta: null, fotos: [] });
      expect(r.cuerpo.otrosRegistros.map((o) => o.id)).toEqual([ids['vencido']]);
      expect(r.cuerpo.historial.map((h) => h.tipo)).toEqual(['EDICION', 'CREACION']);
      expect(r.cuerpo.historial[0]?.cambios).toEqual({ descripcion: { antes: DESC, despues: 'Nueva descripción con más de veinte letras' } });
    });

    it('registro cerrado: fecha efectiva y evidencia de cierre, historial con CIERRE y sin edición falsa', async () => {
      const r = await llamar<DetalleRegistro>(ap.url, 'GET', `/api/registros/${ids['cerrado']}`, { cookies: cSec });
      expect(r.cuerpo).toMatchObject({ estado: 'CERRADO', fechaEfectiva: hoy, evidenciaCierre: { nombreOriginal: 'c.pdf' }, vencido: false });
      expect(r.cuerpo.historial.map((h) => h.tipo)).toEqual(['CIERRE', 'CREACION']);
      expect(r.cuerpo.permisos).toEqual({ puedeModificar: false });
    });

    it('permisos por rol: calidad y fuera de alcance traen el motivo', async () => {
      const cal = await llamar<DetalleRegistro>(ap.url, 'GET', `/api/registros/${ids['hoy']}`, { cookies: cCal });
      expect(cal.cuerpo.permisos).toEqual({ puedeModificar: false, motivoConsulta: 'Tu perfil es de consulta: puedes revisar y descargar este registro, pero no modificar.' });
      const fuera = await llamar<DetalleRegistro>(ap.url, 'GET', `/api/registros/${ids['otra']}`, { cookies: cCar });
      expect(fuera.cuerpo.permisos.motivoConsulta).toBe(`${e.nombreCarreraB} está fuera de tu alcance (${e.nombreCarreraB.replace('Carrera B', 'Carrera A')}). Puedes consultar este registro, pero no modificar.`);
    });

    it('id desconocido o mal formado: 404 con el mensaje', async () => {
      for (const id of [randomUUID(), 'no-es-uuid']) {
        const r = await llamar(ap.url, 'GET', `/api/registros/${id}`, { cookies: cSec });
        expect(r.estado).toBe(404);
        expect(r.cuerpo).toMatchObject({ message: 'No encontramos ese registro' });
      }
    });
  });

  describe('PATCH', () => {
    const editar = (id: string, json: unknown, c = cSec) => llamar<{ sinCambios?: boolean; errores?: Array<{ campo: string; mensaje: string }>; message?: string }>(ap.url, 'PATCH', `/api/registros/${id}`, { cookies: c, json });

    it('sin cambios no escribe; con cambios actualiza la fecha', async () => {
      expect((await editar(ids['malla'] ?? '', { descripcion: 'Detalle 100% literal_', fechaComprometida: sumarDias(hoy, 10) })).cuerpo).toEqual({ sinCambios: true });
      expect((await editar(ids['malla'] ?? '', {})).cuerpo).toEqual({ sinCambios: true });
      expect((await editar(ids['malla'] ?? '', { fechaComprometida: sumarDias(hoy, 40) })).cuerpo).toEqual({ sinCambios: false });
      const d = await llamar<DetalleRegistro>(ap.url, 'GET', `/api/registros/${ids['malla']}`, { cookies: cSec });
      expect(d.cuerpo.fechaComprometida).toBe(sumarDias(hoy, 40));
      expect(d.cuerpo.historial[0]?.cambios).toEqual({ fechaComprometida: { antes: sumarDias(hoy, 10), despues: sumarDias(hoy, 40) } });
    });

    it('400 con los mensajes del prototipo', async () => {
      expect((await editar(ids['malla'] ?? '', { descripcion: 'corta' })).cuerpo.errores).toEqual([{ campo: 'descripcion', mensaje: 'La descripción necesita al menos 20 caracteres.' }]);
      expect((await editar(ids['malla'] ?? '', { fechaComprometida: 'mañana' })).cuerpo.errores).toEqual([{ campo: 'fechaComprometida', mensaje: 'Indica la fecha comprometida.' }]);
      expect((await editar(ids['malla'] ?? '', { fechaComprometida: '2020-01-01' })).cuerpo.errores).toEqual([{ campo: 'fechaComprometida', mensaje: 'No puede ser anterior a la sesión.' }]);
    });

    it('403 fuera de alcance, 403 calidad, 404 inexistente, 409 cerrado', async () => {
      const fuera = await editar(ids['otra'] ?? '', { descripcion: 'Otra descripción suficientemente larga' }, cCar);
      expect(fuera.estado).toBe(403);
      expect(fuera.cuerpo.message).toMatch(/está fuera de tu alcance/);
      expect((await editar(ids['hoy'] ?? '', { descripcion: 'Otra descripción suficientemente larga' }, cCal)).estado).toBe(403);
      expect((await editar(randomUUID(), {})).estado).toBe(404);
      const cerrado = await editar(ids['cerrado'] ?? '', { descripcion: 'Otra descripción suficientemente larga' });
      expect(cerrado.estado).toBe(409);
      expect(cerrado.cuerpo.message).toMatch(/cerrado y no admite modificaciones/);
    });
  });
});
