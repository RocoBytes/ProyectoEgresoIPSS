import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DetalleRegistro, RespuestaCambioEstado } from '@ipss/shared';
import { hoyEnSantiago } from '../src/comun/fecha-texto';
import { type AppDePruebas, conMigrador, levantarApp } from './ayudas/acceso';
import { type Escenario, HEIC, JPG, PDF, PNG, cookiesDeUsuario, crearEscenario, llamar, sumarDias } from './ayudas/escenario';

interface Errores { message: string; errores: Array<{ campo: string; mensaje: string }> }
type Cuerpo = RespuestaCambioEstado & Errores;

const DESC = 'Descripción de prueba con más de veinte caracteres';

describe('POST /api/registros/:id/cierre y /anulacion', () => {
  let ap: AppDePruebas;
  let e: Escenario;
  let dir: string;
  let hoy: string;
  let fechaSesion: string;
  let sesionId: string;
  let cSec: Record<string, string>;
  let cCar: Record<string, string>;
  let cCal: Record<string, string>;

  const nuevoRegistro = async (carrera = e.carreraA): Promise<string> =>
    conMigrador(
      async (c) =>
        (await c.query<{ id: string }>(
          "INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, descripcion, fecha_comprometida, actualizado_por) VALUES ($1, $2, 'PERFIL_EGRESO', $3, $4, $5) RETURNING id",
          [sesionId, carrera, DESC, sumarDias(hoy, 30), e.sectorial.id],
        )).rows[0]?.id ?? '',
    );
  const fila = async (id: string) =>
    (await conMigrador((c) => c.query<{ estado: string; fecha_efectiva: string | null; evidencia_cierre_id: string | null; comentario_cierre: string | null; motivo_anulacion: string | null }>(
      "SELECT estado, to_char(fecha_efectiva, 'YYYY-MM-DD') AS fecha_efectiva, evidencia_cierre_id, comentario_cierre, motivo_anulacion FROM registro WHERE id = $1", [id]))).rows[0];
  const evidenciaPdf = { nombre: 'Informe Ñuñoa.pdf', contenido: PDF, tipo: 'application/pdf' };
  const cerrar = (id: string, datos: unknown, o: { evidencia?: { nombre: string; contenido: Buffer } | null; c?: Record<string, string> } = {}) =>
    llamar<Cuerpo>(ap.url, 'POST', `/api/registros/${id}/cierre`, { cookies: o.c ?? cSec, datos, evidencia: o.evidencia === undefined ? evidenciaPdf : o.evidencia });
  const anular = (id: string, json: unknown, c = cSec) => llamar<Cuerpo>(ap.url, 'POST', `/api/registros/${id}/anulacion`, { cookies: c, json });
  const detalle = async (id: string) => (await llamar<DetalleRegistro>(ap.url, 'GET', `/api/registros/${id}`, { cookies: cSec })).cuerpo;
  const campos = (r: { cuerpo: Errores }) => Object.fromEntries(r.cuerpo.errores.map((x) => [x.campo, x.mensaje]));
  const archivosEn = async (): Promise<string[]> => (await readdir(dir)).filter((n) => n !== '.entrantes');

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ipss-cierre-'));
    ap = await levantarApp([], dir);
    e = await crearEscenario();
    hoy = hoyEnSantiago(ap.reloj);
    fechaSesion = sumarDias(hoy, -10);
    sesionId = (await conMigrador((c) => c.query<{ id: string }>("INSERT INTO sesion (canal_id, fecha, instancia, participantes, creado_por) VALUES ($1, $2, 'Comité', ARRAY['Ana'], $3) RETURNING id", [e.canal, fechaSesion, e.sectorial.id]))).rows[0]?.id ?? '';
    [cSec, cCar, cCal] = await Promise.all([cookiesDeUsuario(ap, e.sectorial), cookiesDeUsuario(ap, e.directorCarrera), cookiesDeUsuario(ap, e.calidad)]);
  });
  afterAll(async () => {
    await ap.app.close();
    await rm(dir, { recursive: true, force: true });
  });

  describe('cierre', () => {
    it('lo cierra un director de carrera dentro de su alcance, con evidencia descargable y entrada de historial', async () => {
      const id = await nuevoRegistro();
      const r = await cerrar(id, { fechaEfectiva: sumarDias(hoy, -2), comentario: '  Se actualizó el programa.  ' }, { c: cCar });
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({ id, estado: 'CERRADO' });
      expect(r.cuerpo.correlativo).toMatch(/^R-\d{4}-\d+$/);
      const f = await fila(id);
      expect(f).toMatchObject({ estado: 'CERRADO', fecha_efectiva: sumarDias(hoy, -2), comentario_cierre: 'Se actualizó el programa.' });
      const d = await detalle(id);
      expect(d.evidenciaCierre).toMatchObject({ nombreOriginal: 'Informe Ñuñoa.pdf', mime: 'application/pdf' });
      expect(d.fechaEfectiva).toBe(sumarDias(hoy, -2));
      expect(d.historial[0]).toMatchObject({ tipo: 'CIERRE', usuario: e.directorCarrera.nombre });
      expect(d.historial.map((h) => h.tipo)).toEqual(['CIERRE', 'CREACION']);
      const descarga = await llamar(ap.url, 'GET', `/api/evidencias/${d.evidenciaCierre?.id ?? ''}/descarga`, { cookies: cCal });
      expect(descarga.estado).toBe(200);
      expect(descarga.bytes.equals(PDF)).toBe(true);
      const ev = await conMigrador((c) => c.query<{ sesion_id: string | null }>('SELECT sesion_id FROM evidencia WHERE id = $1', [f?.evidencia_cierre_id]));
      expect(ev.rows[0]?.sesion_id).toBeNull();
    });

    it('lo cierra un director sectorial; JPG y PNG se aceptan; comentario en blanco queda nulo', async () => {
      for (const [nombre, contenido] of [['foto.jpg', JPG], ['foto.png', PNG]] as const) {
        const id = await nuevoRegistro();
        const r = await cerrar(id, { fechaEfectiva: hoy, comentario: '   ' }, { evidencia: { nombre, contenido } });
        expect(r.estado).toBe(200);
        expect(await fila(id)).toMatchObject({ estado: 'CERRADO', comentario_cierre: null });
      }
    });

    it('acepta la fecha igual a la de la sesión y la igual a hoy', async () => {
      expect((await cerrar(await nuevoRegistro(), { fechaEfectiva: fechaSesion })).estado).toBe(200);
      expect((await cerrar(await nuevoRegistro(), { fechaEfectiva: hoy })).estado).toBe(200);
    });

    it('rechaza fecha posterior a hoy, anterior a la sesión, ausente o mal formada', async () => {
      const id = await nuevoRegistro();
      expect(campos(await cerrar(id, { fechaEfectiva: sumarDias(hoy, 1) }))).toEqual({ fechaEfectiva: 'La fecha efectiva no puede ser posterior a hoy.' });
      const antes = await cerrar(id, { fechaEfectiva: sumarDias(fechaSesion, -1) });
      expect(antes.estado).toBe(400);
      expect(campos(antes)).toEqual({ fechaEfectiva: `La fecha efectiva no puede ser anterior a la sesión (${fechaSesion.split('-').reverse().join('-')}).` });
      for (const datos of [{}, { fechaEfectiva: '2026-02-30' }, { fechaEfectiva: '26-11-2026' }, 'no es json']) {
        const r = await cerrar(id, datos);
        expect(r.estado).toBe(400);
        expect(campos(r)['fechaEfectiva']).toBe('Indica la fecha en que el cambio se hizo efectivo.');
      }
      expect((await fila(id))?.estado).toBe('ABIERTO');
    });

    it('informa todos los errores juntos y no deja archivos', async () => {
      const antes = await archivosEn();
      const r = await cerrar(await nuevoRegistro(), { comentario: 'x'.repeat(2001) }, { evidencia: null });
      expect(r.estado).toBe(400);
      expect(campos(r)).toEqual({
        fechaEfectiva: 'Indica la fecha en que el cambio se hizo efectivo.',
        comentario: 'El comentario admite hasta 2.000 caracteres.',
        evidencia: 'Adjunta la evidencia. Sin ella el registro no se puede cerrar.',
      });
      expect(await archivosEn()).toEqual(antes);
      expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
    });

    it('rechaza un archivo que no es PDF, JPG ni PNG aunque se llame .pdf, y los HEIC con su aviso', async () => {
      const id = await nuevoRegistro();
      const texto = await cerrar(id, { fechaEfectiva: hoy }, { evidencia: { nombre: 'Falso.pdf', contenido: Buffer.from('hola, esto es texto') } });
      expect(texto.estado).toBe(400);
      expect(campos(texto)).toEqual({ evidencia: '“Falso.pdf” no se puede usar como evidencia. Adjunta un PDF, JPG o PNG.' });
      const heic = await cerrar(id, { fechaEfectiva: hoy }, { evidencia: { nombre: 'iphone.heic', contenido: HEIC } });
      expect(campos(heic)).toEqual({ evidencia: 'Las fotos HEIC del iPhone hay que convertirlas a JPG antes de subirlas.' });
      expect((await fila(id))?.estado).toBe('ABIERTO');
    });

    it('rechaza un archivo de más de 20 MB con 413', async () => {
      const r = await cerrar(await nuevoRegistro(), { fechaEfectiva: hoy }, { evidencia: { nombre: 'grande.pdf', contenido: Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)]) } });
      expect(r.estado).toBe(413);
      expect(r.cuerpo).toMatchObject({ message: 'El archivo pesa más de 20 MB. Reduce el archivo o divídelo.' });
    });

    it('responde 403 fuera de alcance y a Calidad, 401 sin sesión y 404 si no existe', async () => {
      const ajeno = await nuevoRegistro(e.carreraB);
      const fuera = await cerrar(ajeno, { fechaEfectiva: hoy }, { c: cCar });
      expect(fuera.estado).toBe(403);
      expect(fuera.cuerpo.message).toContain(`${e.nombreCarreraB} está fuera de tu alcance`);
      const calidad = await cerrar(await nuevoRegistro(), { fechaEfectiva: hoy }, { c: cCal });
      expect(calidad.estado).toBe(403);
      expect((await llamar(ap.url, 'POST', `/api/registros/${ajeno}/cierre`, { datos: { fechaEfectiva: hoy }, evidencia: evidenciaPdf })).estado).toBe(401);
      const noExiste = await cerrar('00000000-0000-4000-8000-000000000000', { fechaEfectiva: hoy });
      expect(noExiste.estado).toBe(404);
      expect(noExiste.cuerpo).toMatchObject({ message: 'No encontramos ese registro' });
      expect((await cerrar('no-es-uuid', { fechaEfectiva: hoy })).estado).toBe(404);
      expect((await fila(ajeno))?.estado).toBe('ABIERTO');
    });

    it('responde 409 si ya está cerrado o anulado, sin guardar el archivo, y PATCH tras cerrar también', async () => {
      const cerrado = await nuevoRegistro();
      expect((await cerrar(cerrado, { fechaEfectiva: hoy })).estado).toBe(200);
      const antes = await archivosEn();
      const otra = await cerrar(cerrado, { fechaEfectiva: hoy });
      expect(otra.estado).toBe(409);
      expect(otra.cuerpo.message).toMatch(/^El registro R-\d{4}-\d+ ya está cerrado y no admite modificaciones\.$/);
      const anulado = await nuevoRegistro();
      expect((await anular(anulado, { motivo: 'Registrado por error en la sesión' })).estado).toBe(200);
      const sobreAnulado = await cerrar(anulado, { fechaEfectiva: hoy });
      expect(sobreAnulado.estado).toBe(409);
      expect(sobreAnulado.cuerpo.message).toContain('ya está anulado');
      expect(await archivosEn()).toEqual(antes);
      const patch = await llamar(ap.url, 'PATCH', `/api/registros/${cerrado}`, { cookies: cSec, json: { descripcion: 'Una descripción nueva de más de veinte caracteres' } });
      expect(patch.estado).toBe(409);
    });

    it('con dos cierres simultáneos gana uno, el otro recibe 409 y no queda archivo huérfano', async () => {
      const id = await nuevoRegistro();
      const antes = await archivosEn();
      const [a, b] = await Promise.all([cerrar(id, { fechaEfectiva: hoy }), cerrar(id, { fechaEfectiva: hoy }, { c: cCar })]);
      expect([a.estado, b.estado].sort()).toEqual([200, 409]);
      expect((await archivosEn()).length).toBe(antes.length + 1);
      expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
      const evidencias = await conMigrador((c) => c.query('SELECT id FROM evidencia WHERE id = (SELECT evidencia_cierre_id FROM registro WHERE id = $1)', [id]));
      expect(evidencias.rowCount).toBe(1);
    });

    it('rechaza dos archivos en `evidencia`, un campo de archivo ajeno y un envío de más de 100 MB', async () => {
      const id = await nuevoRegistro();
      const antes = await archivosEn();
      const cabeceras = { cookie: Object.entries(cSec).map(([n, v]) => `${n}=${v}`).join('; '), 'x-forwarded-for': '10.8.1.1' };
      const formulario = (campos: string[]): FormData => {
        const f = new FormData();
        f.append('datos', JSON.stringify({ fechaEfectiva: hoy }));
        for (const campo of campos) f.append(campo, new Blob([new Uint8Array(PDF)], { type: 'application/pdf' }), 'a.pdf');
        return f;
      };
      const enviar = async (campos: string[]) => {
        const r = await fetch(`${ap.url}/api/registros/${id}/cierre`, { method: 'POST', headers: cabeceras, body: formulario(campos) });
        return { estado: r.status, cuerpo: (await r.json()) as Errores };
      };
      const dos = await enviar(['evidencia', 'evidencia']);
      expect(dos.estado).toBe(400);
      expect(dos.cuerpo.message).toBe('Adjunta una sola evidencia.');
      const ajeno = await enviar(['acta']);
      expect(ajeno.estado).toBe(400);
      expect(ajeno.cuerpo.message).toBe('La solicitud trae un archivo que no corresponde.');

      // fetch no deja falsear Content-Length: se usa node:http y no se envía ningún byte del cuerpo.
      const grande = await new Promise<{ estado: number; cuerpo: string }>((resolver, rechazar) => {
        const peticion = request(
          `${ap.url}/api/registros/${id}/cierre`,
          { method: 'POST', headers: { ...cabeceras, 'content-type': 'multipart/form-data; boundary=limite', 'content-length': '100000001' } },
          (respuesta) => {
            const partes: Buffer[] = [];
            respuesta.on('data', (parte: Buffer) => partes.push(parte));
            respuesta.on('end', () => {
              resolver({ estado: respuesta.statusCode ?? 0, cuerpo: Buffer.concat(partes).toString('utf8') });
              peticion.destroy();
            });
          },
        );
        peticion.on('error', rechazar);
        peticion.flushHeaders();
      });
      expect(grande.estado).toBe(413);
      expect((JSON.parse(grande.cuerpo) as { message: string }).message).toBe('El envío supera los 100 MB en total. Adjunta menos fotos o reduce su tamaño.');

      expect((await fila(id))?.estado).toBe('ABIERTO');
      expect(await archivosEn()).toEqual(antes);
      expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
    });
  });

  describe('anulación', () => {
    it('anula con el motivo recortado y deja la entrada de historial y el motivo en el detalle', async () => {
      const id = await nuevoRegistro();
      const r = await anular(id, { motivo: '   Registro duplicado de la sesión.   ' }, cCar);
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({ id, estado: 'ANULADO' });
      expect(await fila(id)).toMatchObject({ estado: 'ANULADO', motivo_anulacion: 'Registro duplicado de la sesión.' });
      const d = await detalle(id);
      expect(d.motivoAnulacion).toBe('Registro duplicado de la sesión.');
      expect(d.historial[0]).toMatchObject({ tipo: 'ANULACION', usuario: e.directorCarrera.nombre });
      expect(new Date(d.historial[0]?.fecha ?? '').getTime()).not.toBeNaN();
    });

    it('rechaza un motivo corto (tras recortar), largo o ausente', async () => {
      const id = await nuevoRegistro();
      for (const motivo of ['corto', '    123456789    ', undefined]) {
        const r = await anular(id, { motivo });
        expect(r.estado).toBe(400);
        expect(campos(r)).toEqual({ motivo: 'Explica el motivo con al menos 10 caracteres.' });
      }
      const largo = await anular(id, { motivo: 'x'.repeat(2001) });
      expect(campos(largo)).toEqual({ motivo: 'El motivo admite hasta 2.000 caracteres.' });
      expect((await anular(id, { motivo: 'x'.repeat(2000) })).estado).toBe(200);
    });

    it('responde 403, 401, 404 y 409 igual que el cierre', async () => {
      const ajeno = await nuevoRegistro(e.carreraB);
      expect((await anular(ajeno, { motivo: 'Motivo suficientemente largo' }, cCar)).estado).toBe(403);
      expect((await anular(await nuevoRegistro(), { motivo: 'Motivo suficientemente largo' }, cCal)).estado).toBe(403);
      expect((await llamar(ap.url, 'POST', `/api/registros/${ajeno}/anulacion`, { json: { motivo: 'Motivo suficientemente largo' } })).estado).toBe(401);
      expect((await anular('00000000-0000-4000-8000-000000000000', { motivo: 'Motivo suficientemente largo' })).estado).toBe(404);
      const cerrado = await nuevoRegistro();
      await cerrar(cerrado, { fechaEfectiva: hoy });
      expect((await anular(cerrado, { motivo: 'Motivo suficientemente largo' })).estado).toBe(409);
      const anulado = await nuevoRegistro();
      await anular(anulado, { motivo: 'Motivo suficientemente largo' });
      expect((await anular(anulado, { motivo: 'Motivo suficientemente largo' })).estado).toBe(409);
    });

    it('con dos anulaciones simultáneas, o una anulación y un cierre, gana una y la otra recibe 409', async () => {
      const motivo = { motivo: 'Motivo suficientemente largo' };
      const doble = await nuevoRegistro();
      const [a, b] = await Promise.all([anular(doble, motivo), anular(doble, motivo, cCar)]);
      expect([a.estado, b.estado].sort()).toEqual([200, 409]);
      expect((await fila(doble))?.estado).toBe('ANULADO');

      const mixto = await nuevoRegistro();
      const antes = await archivosEn();
      const [x, y] = await Promise.all([anular(mixto, motivo), cerrar(mixto, { fechaEfectiva: hoy })]);
      expect([x.estado, y.estado].sort()).toEqual([200, 409]);
      // Si ganó la anulación el cierre perdedor no deja archivo; si ganó el cierre, queda exactamente el suyo.
      const ganoCierre = y.estado === 200;
      expect((await fila(mixto))?.estado).toBe(ganoCierre ? 'CERRADO' : 'ANULADO');
      expect((await archivosEn()).length).toBe(antes.length + (ganoCierre ? 1 : 0));
    });
  });
});
