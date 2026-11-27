import { randomUUID } from 'node:crypto';
import type { RespuestaCatalogos, RespuestaObjetosCarrera } from '@ipss/shared';
import { type AppDePruebas, conMigrador, levantarApp } from './ayudas/acceso';
import { type Escenario, cookiesDeUsuario, crearEscenario, llamar } from './ayudas/escenario';

describe('catálogos', () => {
  let ap: AppDePruebas;
  let e: Escenario;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    ap = await levantarApp();
    e = await crearEscenario();
    await conMigrador((c) => c.query("INSERT INTO canal (nombre) VALUES ('Otro') ON CONFLICT DO NOTHING"));
    cookies = await cookiesDeUsuario(ap, e.calidad);
  });
  afterAll(() => ap.app.close());

  it('lista sectores, carreras y solo canales activos, con «Otro» al final', async () => {
    const r = await llamar<RespuestaCatalogos>(ap.url, 'GET', '/api/catalogos', { cookies });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.carreras.find((c) => c.id === e.carreraA)).toMatchObject({ sectorId: e.sectorA });
    expect(r.cuerpo.sectores.map((s) => s.id)).toEqual(expect.arrayContaining([e.sectorA, e.sectorB]));
    const ids = r.cuerpo.canales.map((c) => c.id);
    expect(ids).toContain(e.canal);
    expect(ids).not.toContain(e.canalInactivo);
    expect(r.cuerpo.canales.at(-1)?.nombre).toBe('Otro');
    const nombres = r.cuerpo.canales.slice(0, -1).map((c) => c.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('exige sesión', async () => {
    expect((await llamar(ap.url, 'GET', '/api/catalogos')).estado).toBe(401);
  });

  it('objetos de una carrera: asignaturas, módulos y mallas de la más nueva a la más antigua', async () => {
    await conMigrador((c) => c.query("INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ('m.pdf','application/pdf',1,$1,$2,$3)", ['0'.repeat(64), randomUUID(), e.sectorial.id]));
    const r = await llamar<RespuestaObjetosCarrera>(ap.url, 'GET', `/api/catalogos/carreras/${e.carreraA}/objetos`, { cookies });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.asignaturas.map((a) => a.id).sort()).toEqual([e.asignaturaA, e.asignaturaA2].sort());
    expect(r.cuerpo.modulos.map((a) => a.id)).toEqual([e.moduloA]);
    expect(r.cuerpo.versionesMalla).toEqual([{ id: e.mallaA, anio: 2024, vigenteDesde: '2024-03-01' }]);
  });

  it('carrera desconocida: 404; id mal formado: 400', async () => {
    const r = await llamar(ap.url, 'GET', `/api/catalogos/carreras/${randomUUID()}/objetos`, { cookies });
    expect(r.estado).toBe(404);
    expect(r.cuerpo).toMatchObject({ message: 'No encontramos esa carrera' });
    expect((await llamar(ap.url, 'GET', '/api/catalogos/carreras/abc/objetos', { cookies })).estado).toBe(400);
  });
});
