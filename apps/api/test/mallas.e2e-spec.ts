import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RespuestaMallas, VersionMallaListada } from '@ipss/shared';
import { hoyEnSantiago } from '../src/comun/fecha-texto';
import { type AppDePruebas, conMigrador, crearCarrera, crearUsuario, levantarApp } from './ayudas/acceso';
import { type Escenario, PDF, PNG, cookiesDeUsuario, crearEscenario, llamar } from './ayudas/escenario';

interface Errores { message: string; errores: Array<{ campo: string; mensaje: string }> }
type Cuerpo = VersionMallaListada & Errores;
interface Objetos { versionesMalla: Array<{ id: string; anio: number; vigenteDesde: string }> }

const pdf = { nombre: 'Malla Ñuñoa.pdf', contenido: PDF, tipo: 'application/pdf' };

describe('/api/mallas (e2e contra PostgreSQL real)', () => {
  let ap: AppDePruebas;
  let e: Escenario;
  let dir: string;
  let hoy: string;
  let cSec: Record<string, string>;
  let cCar: Record<string, string>;
  let cCal: Record<string, string>;

  const carreraNueva = async (): Promise<string> => crearCarrera(e.sectorA, `Carrera mallas ${randomUUID().slice(0, 8)}`);
  const subir = (datos: unknown, o: { archivo?: { nombre: string; contenido: Buffer } | null; c?: Record<string, string> } = {}) =>
    llamar<Cuerpo>(ap.url, 'POST', '/api/mallas', { cookies: o.c ?? cSec, datos, archivoMalla: o.archivo === undefined ? pdf : o.archivo });
  const listar = (carreraId: string, c = cCal) => llamar<RespuestaMallas>(ap.url, 'GET', `/api/mallas?carreraId=${carreraId}`, { cookies: c });
  const archivosEn = async (): Promise<string[]> => (await readdir(dir)).filter((n) => n !== '.entrantes');
  const campos = (r: { cuerpo: Errores }) => Object.fromEntries(r.cuerpo.errores.map((x) => [x.campo, x.mensaje]));
  const directa = async (carreraId: string, anio: number, desde: string, subidoPor: string): Promise<void> =>
    conMigrador(async (c) => {
      const ev = (await c.query<{ id: string }>("INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por) VALUES ($1,'application/pdf',1,$2,$3,$4) RETURNING id", [`malla-${String(anio)}.pdf`, '0'.repeat(64), randomUUID(), subidoPor])).rows[0]?.id;
      await c.query('INSERT INTO version_malla (carrera_id, anio, vigente_desde, archivo_id) VALUES ($1,$2,$3,$4)', [carreraId, anio, desde, ev]);
    });

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ipss-mallas-'));
    ap = await levantarApp([], dir);
    e = await crearEscenario();
    hoy = hoyEnSantiago(ap.reloj);
    [cSec, cCar, cCal] = await Promise.all([cookiesDeUsuario(ap, e.sectorial), cookiesDeUsuario(ap, e.directorCarrera), cookiesDeUsuario(ap, e.calidad)]);
  });
  afterAll(async () => {
    await ap.app.close();
    await rm(dir, { recursive: true, force: true });
  });

  describe('listado', () => {
    it('ordena por año descendente, marca solo la más reciente como vigente y trae archivo, autor y permisos', async () => {
      const carrera = await carreraNueva();
      await directa(carrera, 2022, '2022-03-01', e.sectorial.id);
      await directa(carrera, 2024, '2024-03-01', e.sectorial.id);
      await directa(carrera, 2023, '2023-03-01', e.sectorial.id);
      const r = await listar(carrera);
      expect(r.estado).toBe(200);
      expect(r.cuerpo.versiones.map((v) => [v.anio, v.vigente])).toEqual([[2024, true], [2023, false], [2022, false]]);
      expect(r.cuerpo.versiones[0]).toMatchObject({ vigenteDesde: '2024-03-01', subidaPor: e.sectorial.nombre, archivo: { nombreOriginal: 'malla-2024.pdf', mime: 'application/pdf', tamano: 1, sha256: '0'.repeat(64) } });
      expect(new Date(r.cuerpo.versiones[0]?.creadaEn ?? '').getTime()).not.toBeNaN();
      expect(r.cuerpo.permisos).toEqual({ puedeSubir: false, motivoConsulta: 'Tu perfil es de consulta: puedes revisar y descargar sus mallas, pero no modificar.' });
      expect((await listar(carrera, cSec)).cuerpo.permisos).toEqual({ puedeSubir: true });
      const fuera = (await listar(carrera, cCar)).cuerpo.permisos;
      expect(fuera.puedeSubir).toBe(false);
      expect(fuera.motivoConsulta).toContain('está fuera de tu alcance');
      expect(fuera.motivoConsulta).toMatch(/Puedes consultar sus mallas, pero no modificar\.$/);
    });

    it('una carrera sin versiones devuelve la lista vacía; 400 con un id inválido, 404 si no existe y 401 sin sesión', async () => {
      expect((await listar(await carreraNueva())).cuerpo.versiones).toEqual([]);
      expect((await listar('no-es-uuid')).estado).toBe(400);
      expect((await listar(randomUUID())).estado).toBe(404);
      expect((await llamar(ap.url, 'GET', `/api/mallas?carreraId=${e.carreraA}`)).estado).toBe(401);
    });
  });

  describe('subida', () => {
    it('crea la versión con su PDF, la marca vigente solo si es la más reciente y la descarga entrega los mismos bytes', async () => {
      const carrera = await carreraNueva();
      const r = await subir({ carreraId: carrera, anio: 2024, vigenteDesde: '2024-03-01' });
      expect(r.estado).toBe(201);
      expect(r.cuerpo).toMatchObject({ anio: 2024, vigenteDesde: '2024-03-01', vigente: true, subidaPor: e.sectorial.nombre, archivo: { nombreOriginal: 'Malla Ñuñoa.pdf', mime: 'application/pdf' } });
      const anterior = await subir({ carreraId: carrera, anio: '2020', vigenteDesde: '2020-03-01' }, { c: cSec });
      expect(anterior.estado).toBe(201);
      expect(anterior.cuerpo.vigente).toBe(false);
      expect((await listar(carrera)).cuerpo.versiones.map((v) => [v.anio, v.vigente])).toEqual([[2024, true], [2020, false]]);

      const descarga = await llamar(ap.url, 'GET', `/api/evidencias/${r.cuerpo.archivo.id}/descarga`, { cookies: cCal });
      expect(descarga.estado).toBe(200);
      expect(descarga.bytes.equals(PDF)).toBe(true);
      const ev = await conMigrador((c) => c.query<{ sesion_id: string | null; subido_por: string }>('SELECT sesion_id, subido_por FROM evidencia WHERE id = $1', [r.cuerpo.archivo.id]));
      expect(ev.rows[0]).toEqual({ sesion_id: null, subido_por: e.sectorial.id });
    });

    it('un director de carrera sube para su carrera, y la nueva versión aparece como objeto de nivel Malla', async () => {
      const r = await subir({ carreraId: e.carreraA, anio: 2011, vigenteDesde: '2011-03-01' }, { c: cCar });
      expect(r.estado).toBe(201);
      const objetos = await llamar<Objetos>(ap.url, 'GET', `/api/catalogos/carreras/${e.carreraA}/objetos`, { cookies: cCar });
      expect(objetos.cuerpo.versionesMalla).toContainEqual({ id: r.cuerpo.id, anio: 2011, vigenteDesde: '2011-03-01' });
    });

    it('informa todos los errores de campo juntos, sin guardar nada', async () => {
      const carrera = await carreraNueva();
      const antes = await archivosEn();
      const todos = await subir({ carreraId: carrera, anio: '99' }, { archivo: null });
      expect(todos.estado).toBe(400);
      expect(campos(todos)).toEqual({ anio: 'Escribe el año con cuatro dígitos.', vigenteDesde: 'Indica desde cuándo rige.', archivo: 'Adjunta el PDF de la malla.' });
      const anioMax = Number(hoy.slice(0, 4)) + 1;
      for (const anio of ['abc', '1999', String(anioMax + 1), '20245', '']) {
        expect(campos(await subir({ carreraId: carrera, anio, vigenteDesde: '2024-03-01' }))).toEqual({ anio: 'Escribe el año con cuatro dígitos.' });
      }
      expect((await subir({ carreraId: carrera, anio: anioMax, vigenteDesde: '2024-03-01' })).estado).toBe(201);
      for (const vigenteDesde of [undefined, '2024-02-30', '01-03-2024']) {
        expect(campos(await subir({ carreraId: carrera, anio: 2019, vigenteDesde }))).toEqual({ vigenteDesde: 'Indica desde cuándo rige.' });
      }
      const texto = await subir({ carreraId: carrera, anio: 2019, vigenteDesde: '2019-03-01' }, { archivo: { nombre: 'Falso.pdf', contenido: Buffer.from('hola') } });
      expect(campos(texto)).toEqual({ archivo: '“Falso.pdf” no es un PDF. La malla debe adjuntarse en PDF.' });
      const imagen = await subir({ carreraId: carrera, anio: 2019, vigenteDesde: '2019-03-01' }, { archivo: { nombre: 'malla.png', contenido: PNG } });
      expect(campos(imagen)).toEqual({ archivo: '“malla.png” no es un PDF. La malla debe adjuntarse en PDF.' });
      const ilegible = await subir('no es json');
      expect(ilegible.estado).toBe(400);
      expect(campos(ilegible)).toEqual({ datos: 'Los datos de la malla no se pudieron leer.' });
      expect((await archivosEn()).length).toBe(antes.length + 1); // solo la del año máximo, que sí se guardó
      expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
    });

    it('rechaza un archivo de más de 20 MB con 413', async () => {
      const r = await subir({ carreraId: await carreraNueva(), anio: 2018, vigenteDesde: '2018-03-01' }, { archivo: { nombre: 'grande.pdf', contenido: Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)]) } });
      expect(r.estado).toBe(413);
      expect(r.cuerpo).toMatchObject({ message: 'El archivo pesa más de 20 MB. Reduce el archivo o divídelo.' });
    });

    it('rechaza el año repetido, también con dos subidas simultáneas, y no deja archivo huérfano', async () => {
      const carrera = await carreraNueva();
      expect((await subir({ carreraId: carrera, anio: 2015, vigenteDesde: '2015-03-01' })).estado).toBe(201);
      const repetida = await subir({ carreraId: carrera, anio: 2015, vigenteDesde: '2015-03-01' });
      expect(repetida.estado).toBe(400);
      expect(campos(repetida)).toEqual({ anio: 'Ya existe la malla 2015 de esta carrera.' });

      const antes = await archivosEn();
      const [a, b] = await Promise.all([
        subir({ carreraId: carrera, anio: 2016, vigenteDesde: '2016-03-01' }),
        subir({ carreraId: carrera, anio: 2016, vigenteDesde: '2016-03-01' }, { c: cSec }),
      ]);
      expect([a.estado, b.estado].sort()).toEqual([201, 400]);
      expect(campos(a.estado === 400 ? a : b)).toEqual({ anio: 'Ya existe la malla 2016 de esta carrera.' });
      expect((await archivosEn()).length).toBe(antes.length + 1);
      expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
      const filas = await conMigrador((c) => c.query('SELECT 1 FROM version_malla WHERE carrera_id = $1 AND anio = 2016', [carrera]));
      expect(filas.rowCount).toBe(1);
      // Sin la versión, la evidencia de la subida perdedora tampoco queda: la transacción la deshace.
      const evidencias = await conMigrador((c) => c.query('SELECT 1 FROM evidencia WHERE nombre_original = $1 AND creado_en > now() - interval \'1 minute\' AND id NOT IN (SELECT archivo_id FROM version_malla) AND sesion_id IS NULL AND subido_por = $2', ['Malla Ñuñoa.pdf', e.sectorial.id]));
      expect(evidencias.rowCount).toBe(0);
    });

    it('responde 403 fuera de alcance y a Calidad, 401 sin sesión y 404 con una carrera desconocida o mal escrita', async () => {
      const ajena = await carreraNueva();
      const fuera = await subir({ carreraId: ajena, anio: 2013, vigenteDesde: '2013-03-01' }, { c: cCar });
      expect(fuera.estado).toBe(403);
      expect(fuera.cuerpo.message).toContain('está fuera de tu alcance');
      expect(fuera.cuerpo.message).toContain('Puedes consultar sus mallas, pero no modificar.');
      const calidad = await subir({ carreraId: ajena, anio: 2013, vigenteDesde: '2013-03-01' }, { c: cCal });
      expect(calidad.estado).toBe(403);
      expect((await llamar(ap.url, 'POST', '/api/mallas', { datos: { carreraId: ajena }, archivoMalla: pdf })).estado).toBe(401);
      expect((await subir({ carreraId: randomUUID(), anio: 2013, vigenteDesde: '2013-03-01' })).estado).toBe(404);
      expect((await subir({ carreraId: 'no-es-uuid', anio: 2013, vigenteDesde: '2013-03-01' })).estado).toBe(404);
      expect((await subir({ anio: 2013 })).estado).toBe(404);
      const sinFilas = await conMigrador((c) => c.query('SELECT 1 FROM version_malla WHERE carrera_id = $1', [ajena]));
      expect(sinFilas.rowCount).toBe(0);
      expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
    });
  });

  it('un usuario sectorial de otro sector no puede subir', async () => {
    const otro = await crearUsuario('DIRECTOR_SECTORIAL', { sectores: [e.sectorB] });
    const r = await subir({ carreraId: e.carreraA, anio: 2009, vigenteDesde: '2009-03-01' }, { c: await cookiesDeUsuario(ap, otro) });
    expect(r.estado).toBe(403);
  });
});
