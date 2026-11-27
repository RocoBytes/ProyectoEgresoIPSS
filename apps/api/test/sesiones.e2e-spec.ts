import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RespuestaSesionCreada } from '@ipss/shared';
import { hoyEnSantiago } from '../src/comun/fecha-texto';
import { Readable } from 'node:stream';
import { ALMACENAMIENTO_EVIDENCIAS, type AlmacenamientoEvidencias } from '../src/evidencias/almacenamiento';
import { PrismaService } from '../src/prisma/prisma.service';
import { type AppDePruebas, conMigrador, levantarApp } from './ayudas/acceso';
import { type Escenario, HEIC, JPG, PDF, PNG, cookiesDeUsuario, crearEscenario, llamar, sumarDias } from './ayudas/escenario';

interface Errores { errores: Array<{ campo: string; mensaje: string }>; message: string }

describe('POST /api/sesiones y descarga de evidencias', () => {
  let ap: AppDePruebas;
  let e: Escenario;
  let dir: string;
  let cookies: Record<string, string>;
  let hoy: string;

  const registro = (extra: Record<string, unknown> = {}) => ({ carreraId: e.carreraA, nivelImpacto: 'ASIGNATURA', asignaturaId: e.asignaturaA, descripcion: 'Actualizar el contenido de la unidad dos.', fechaComprometida: sumarDias(hoy, 30), ...extra });
  const datos = (extra: Record<string, unknown> = {}) => ({ canalId: e.canal, fecha: sumarDias(hoy, -1), instancia: 'Comité de currículo', participantes: ['Ana Pérez', 'Luis Soto'], registros: [registro()], ...extra });
  const acta = { nombre: 'Acta comité Ñuñoa.pdf', contenido: PDF, tipo: 'application/pdf' };
  const crear = (d: unknown, o: { acta?: { nombre: string; contenido: Buffer; tipo?: string } | null; fotos?: Array<{ nombre: string; contenido: Buffer }>; c?: Record<string, string> } = {}) =>
    llamar<RespuestaSesionCreada & Errores>(ap.url, 'POST', '/api/sesiones', { cookies: o.c ?? cookies, datos: d, acta: o.acta === undefined ? acta : o.acta, fotos: o.fotos });
  const campos = (r: { cuerpo: Errores }) => Object.fromEntries(r.cuerpo.errores.map((x) => [x.campo, x.mensaje]));
  const archivosEn = async (sub = ''): Promise<string[]> => (await readdir(join(dir, sub))).filter((n) => n !== '.entrantes');

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ipss-sesiones-'));
    ap = await levantarApp([], dir);
    e = await crearEscenario();
    cookies = await cookiesDeUsuario(ap, e.sectorial);
    hoy = hoyEnSantiago(ap.reloj);
  });
  afterAll(async () => {
    await ap.app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('crea la sesión con dos registros, correlativos, evidencias y la forma de respuesta', async () => {
    const r = await crear(datos({ registros: [registro(), registro({ nivelImpacto: 'RECURSO', recurso: 'Guía de laboratorio' }), registro({ nivelImpacto: 'MALLA', versionMallaId: e.mallaA, asignaturaId: undefined }), registro({ nivelImpacto: 'PERFIL_EGRESO', asignaturaId: undefined })] }), { fotos: [{ nombre: 'a.png', contenido: PNG }, { nombre: 'b.jpg', contenido: JPG }] });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.registros).toHaveLength(4);
    expect(r.cuerpo.registros.map((x) => x.objeto)).toEqual([expect.stringMatching(/^Bases de Datos/), expect.stringMatching(/^Bases de Datos .* · Guía de laboratorio$/), 'Malla 2024', `Perfil de egreso de ${r.cuerpo.registros[3]?.carrera.nombre}`]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- los asimétricos de Jest devuelven any
    expect(r.cuerpo.registros[0]).toMatchObject({ correlativo: expect.stringMatching(/^R-\d{4}-\d{3,}$/), nivelImpacto: 'ASIGNATURA', fechaComprometida: sumarDias(hoy, 30) });
    expect(r.cuerpo.fecha).toBe(sumarDias(hoy, -1));
    const filas = await conMigrador((c) => c.query<{ nombre_original: string; sha256: string; ruta: string }>('SELECT nombre_original, sha256, ruta FROM evidencia WHERE sesion_id = $1 ORDER BY creado_en', [r.cuerpo.sesionId]));
    expect(filas.rows).toHaveLength(3);
    expect(filas.rows[0]?.nombre_original).toBe('Acta comité Ñuñoa.pdf');
    for (const f of filas.rows) expect(await archivosEn()).toContain(f.ruta);
    const reg = await conMigrador((c) => c.query<{ actualizado_por: string }>('SELECT actualizado_por FROM registro WHERE sesion_id = $1', [r.cuerpo.sesionId]));
    expect(reg.rows.every((x) => x.actualizado_por === e.sectorial.id)).toBe(true);
  });

  it('cada regla de validación aparece en su campo exacto', async () => {
    const r = await crear({ canalId: 'x', fecha: 'mañana', instancia: 'ab', participantes: ['  ', ''], registros: [{ carreraId: 'x', nivelImpacto: 'otro', descripcion: 'corta', fechaComprometida: '2026-02-30' }] }, { acta: null });
    expect(r.estado).toBe(400);
    expect(campos(r)).toMatchObject({
      acta: 'Adjunta el acta en PDF: es la evidencia de origen de la sesión.',
      canalId: 'Selecciona el canal por el que llegó la retroalimentación.',
      fecha: 'Indica la fecha de la sesión.',
      instancia: 'Escribe el nombre de la instancia.',
      participantes: 'Anota al menos un participante.',
      'registros.0.carreraId': 'Selecciona la carrera.',
      'registros.0.nivelImpacto': 'Selecciona el nivel de impacto.',
      'registros.0.descripcion': 'Describe lo observado con al menos 20 caracteres.',
      'registros.0.fechaComprometida': 'Indica la fecha comprometida.',
    });
  });

  it('registros vacíos, objeto faltante por nivel, recurso, fechas y duplicado', async () => {
    expect(campos(await crear(datos({ registros: [] })))['registros']).toBe('Agrega al menos un registro.');
    const r = await crear(datos({ fecha: sumarDias(hoy, 1), registros: [registro({ asignaturaId: undefined }), registro({ nivelImpacto: 'MODULO', asignaturaId: undefined }), registro({ nivelImpacto: 'MALLA', asignaturaId: undefined }), registro({ nivelImpacto: 'RECURSO', recurso: ' x ' })] }));
    expect(campos(r)).toMatchObject({
      fecha: 'La fecha de la sesión no puede ser posterior a hoy.',
      'registros.0.asignaturaId': 'Selecciona la asignatura.',
      'registros.1.asignaturaId': 'Selecciona el módulo.',
      'registros.2.versionMallaId': 'Selecciona la versión de malla.',
      'registros.3.recurso': 'Indica qué recurso se ve afectado.',
    });
    const anterior = await crear(datos({ registros: [registro({ fechaComprometida: sumarDias(hoy, -5) })] }));
    expect(campos(anterior)['registros.0.fechaComprometida']).toBe('La fecha comprometida no puede ser anterior a la sesión.');
    const dup = await crear(datos({ registros: [registro({ nivelImpacto: 'RECURSO', recurso: 'Guía' }), registro({ nivelImpacto: 'RECURSO', recurso: '  guía ' })] }));
    expect(campos(dup)['registros.1.nivelImpacto']).toBe('Ya hay otro registro igual en esta sesión.');
  });

  it('canal inactivo: 400; carrera fuera del alcance: 403; calidad: 403', async () => {
    expect(campos(await crear(datos({ canalId: e.canalInactivo })))['canalId']).toMatch(/^Selecciona el canal/);
    const fuera = await crear(datos({ registros: [registro({ carreraId: e.carreraB, asignaturaId: e.asignaturaB })] }));
    expect(fuera.estado).toBe(403);
    expect(fuera.cuerpo).toMatchObject({ message: `No puedes crear registros para ${e.nombreCarreraB}: está fuera de tu alcance.` });
    expect((await crear(datos(), { c: await cookiesDeUsuario(ap, e.calidad) })).estado).toBe(403);
  });

  it('un objeto de otra carrera o del tipo equivocado se rechaza en su campo', async () => {
    const r = await crear(datos({ registros: [registro({ asignaturaId: e.asignaturaA2, carreraId: e.carreraA2 }), registro({ nivelImpacto: 'MODULO', asignaturaId: e.asignaturaA })] }));
    expect(r.estado).toBe(400);
    expect(campos(r)).toMatchObject({ 'registros.0.asignaturaId': 'Selecciona la asignatura.', 'registros.1.asignaturaId': 'Selecciona el módulo.' });
  });

  it('valida por contenido: HTML renombrado .pdf, PNG como acta, HEIC como foto', async () => {
    const html = await crear(datos(), { acta: { nombre: 'falso.pdf', contenido: Buffer.from('<html><body>hola</body></html>'), tipo: 'application/pdf' } });
    expect(html.estado).toBe(400);
    expect(campos(html)['acta']).toBe('“falso.pdf” no es un PDF. El acta debe adjuntarse en PDF.');
    expect(campos(await crear(datos(), { acta: { nombre: 'foto.png', contenido: PNG } }))['acta']).toMatch(/no es un PDF/);
    const heic = await crear(datos(), { fotos: [{ nombre: 'IMG_1.HEIC', contenido: HEIC }, { nombre: 'doc.pdf', contenido: PDF }] });
    expect(campos(heic)['fotos.0']).toBe('“IMG_1.HEIC” no es JPG ni PNG. Las fotos HEIC del iPhone hay que convertirlas a JPG antes de subirlas.');
    expect(campos(heic)['fotos.1']).toBe('“doc.pdf” no es JPG ni PNG.');
  });

  it('un archivo de 21 MB da 413 con el mensaje', async () => {
    const r = await crear(datos(), { acta: { nombre: 'grande.pdf', contenido: Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]) } });
    expect(r.estado).toBe(413);
    expect(r.cuerpo).toMatchObject({ message: 'El archivo pesa más de 20 MB. Reduce el archivo o divídelo.' });
  });

  it('más de 10 fotos: 400', async () => {
    const r = await crear(datos(), { fotos: Array.from({ length: 11 }, (_, i) => ({ nombre: `f${i}.png`, contenido: PNG })) });
    expect(r.estado).toBe(400);
  });

  it('si la transacción falla tras mover los archivos, no queda nada en el directorio', async () => {
    const antes = await archivosEn();
    const prisma = ap.app.get(PrismaService);
    const espia = jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('fallo forzado'));
    const r = await crear(datos(), { fotos: [{ nombre: 'a.png', contenido: PNG }] });
    espia.mockRestore();
    expect(r.estado).toBe(500);
    expect(await archivosEn()).toEqual(antes);
    expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
  });

  it('límites de tamaño: cada uno aparece en su campo con su mensaje', async () => {
    const largo = 'x'.repeat(201);
    const r = await crear(datos({
      instancia: largo,
      participantes: Array.from({ length: 51 }, (_, i) => `P${i}`),
      registros: [registro({ descripcion: 'y'.repeat(2001) }), registro({ nivelImpacto: 'RECURSO', recurso: largo })],
    }));
    expect(r.estado).toBe(400);
    expect(campos(r)).toMatchObject({
      instancia: 'El nombre de la instancia admite como máximo 200 caracteres.',
      participantes: 'Anota como máximo 50 participantes.',
      'registros.0.descripcion': 'La descripción admite como máximo 2000 caracteres.',
      'registros.1.recurso': 'El recurso admite como máximo 200 caracteres.',
    });
    const muchos = await crear(datos({ participantes: ['Ana', largo], registros: Array.from({ length: 51 }, (_, i) => registro({ asignaturaId: i % 2 === 0 ? e.asignaturaA : e.asignaturaA2 })) }));
    expect(campos(muchos)).toMatchObject({ participantes: 'Cada participante admite como máximo 200 caracteres.', registros: 'Una sesión admite como máximo 50 registros.' });
  });

  it('un nombre de archivo de 300 caracteres se guarda recortado a 255 y con su extensión', async () => {
    const r = await crear(datos(), { acta: { nombre: `${'a'.repeat(296)}.pdf`, contenido: PDF, tipo: 'application/pdf' } });
    expect(r.estado).toBe(201);
    const fila = await conMigrador((c) => c.query<{ nombre_original: string }>('SELECT nombre_original FROM evidencia WHERE sesion_id = $1', [r.cuerpo.sesionId]));
    expect(fila.rows[0]?.nombre_original).toHaveLength(255);
    expect(fila.rows[0]?.nombre_original.endsWith('.pdf')).toBe(true);
    const mala = await crear(datos(), { fotos: [{ nombre: `${'b'.repeat(300)}.txt`, contenido: Buffer.from('hola') }] });
    expect(campos(mala)['fotos.0']).toMatch(/^“b+\.txt” no es JPG ni PNG\.$/);
    expect((campos(mala)['fotos.0'] ?? '').length).toBeLessThan(300);
  });

  it('la 11.ª foto y un segundo archivo de más de 20 MB tras uno válido no dejan temporales', async () => {
    const once = await crear(datos(), { fotos: Array.from({ length: 11 }, (_, i) => ({ nombre: `f${i}.png`, contenido: PNG })) });
    expect(once.estado).toBe(400);
    expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
    const grande = await crear(datos(), { fotos: [{ nombre: 'ok.png', contenido: PNG }, { nombre: 'grande.png', contenido: Buffer.concat([PNG, Buffer.alloc(21 * 1024 * 1024)]) }] });
    expect(grande.estado).toBe(413);
    expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
  });

  it('un 400 de validación tampoco deja archivos temporales', async () => {
    await crear(datos({ instancia: 'x' }), { fotos: [{ nombre: 'a.png', contenido: PNG }] });
    expect(await readdir(join(dir, '.entrantes'))).toEqual([]);
  });

  describe('descarga', () => {
    let evidenciaId: string;
    let ruta: string;
    beforeAll(async () => {
      const r = await crear(datos());
      const fila = await conMigrador((c) => c.query<{ id: string; ruta: string }>('SELECT id, ruta FROM evidencia WHERE sesion_id = $1', [r.cuerpo.sesionId]));
      evidenciaId = fila.rows[0]?.id ?? '';
      ruta = fila.rows[0]?.ruta ?? '';
    });

    it('entrega los bytes con las cabeceras de seguridad y el nombre con acentos', async () => {
      const r = await llamar(ap.url, 'GET', `/api/evidencias/${evidenciaId}/descarga`, { cookies: await cookiesDeUsuario(ap, e.calidad) });
      expect(r.estado).toBe(200);
      expect(r.bytes.equals(PDF)).toBe(true);
      expect(r.cabeceras.get('content-type')).toBe('application/pdf');
      expect(r.cabeceras.get('content-disposition')).toBe(`attachment; filename="Acta comit_ _u_oa.pdf"; filename*=UTF-8''${encodeURIComponent('Acta comité Ñuñoa.pdf')}`);
      expect(r.cabeceras.get('x-content-type-options')).toBe('nosniff');
      expect(r.cabeceras.get('content-security-policy')).toBe("sandbox; default-src 'none'");
      expect(r.cabeceras.get('cache-control')).toBe('private, no-store');
    });

    it('sin sesión: 401; id inexistente: 404', async () => {
      expect((await llamar(ap.url, 'GET', `/api/evidencias/${evidenciaId}/descarga`)).estado).toBe(401);
      expect((await llamar(ap.url, 'GET', `/api/evidencias/${randomUUID()}/descarga`, { cookies })).estado).toBe(404);
    });

    it('si el envío falla tras las cabeceras, se corta la conexión y la API sigue viva', async () => {
      const almacenamiento = ap.app.get<AlmacenamientoEvidencias>(ALMACENAMIENTO_EVIDENCIAS);
      const real = almacenamiento.abrir.bind(almacenamiento);
      const espia = jest.spyOn(almacenamiento, 'abrir').mockImplementationOnce(async (r) => {
        const manejador = await real(r);
        const original = manejador.createReadStream.bind(manejador);
        let llamadas = 0;
        // La primera lectura (hash) es la real; la del envío falla como si el disco se cayera a mitad de camino.
        manejador.createReadStream = ((opciones?: Parameters<typeof original>[0]) => (++llamadas === 2 ? new Readable({ read() { this.destroy(new Error('fallo de disco')); } }) : original(opciones))) as typeof manejador.createReadStream;
        return manejador;
      });
      await expect(llamar(ap.url, 'GET', `/api/evidencias/${evidenciaId}/descarga`, { cookies })).rejects.toThrow();
      espia.mockRestore();
      expect((await llamar(ap.url, 'GET', `/api/evidencias/${evidenciaId}/descarga`, { cookies })).estado).toBe(200);
    });

    it('un archivo alterado en disco da 500 con el mensaje y no se entrega', async () => {
      await writeFile(join(dir, ruta), Buffer.concat([PDF, Buffer.from('alterado')]));
      const r = await llamar(ap.url, 'GET', `/api/evidencias/${evidenciaId}/descarga`, { cookies });
      expect(r.estado).toBe(500);
      expect(r.cuerpo).toMatchObject({ message: 'La evidencia está dañada; avisa al administrador del sistema.' });
    });
  });
  it('rechaza con 413 y mensaje claro un Content-Length mayor a 100 MB sin esperar el cuerpo', async () => {
    // fetch no deja falsear Content-Length: se usa node:http y no se envía ningún byte del cuerpo.
    const { estado, cuerpo } = await new Promise<{ estado: number; cuerpo: string }>((resolver, rechazar) => {
      const peticion = request(
        `${ap.url}/api/sesiones`,
        {
          method: 'POST',
          headers: {
            cookie: Object.entries(cookies).map(([n, v]) => `${n}=${v}`).join('; '),
            'content-type': 'multipart/form-data; boundary=limite',
            'content-length': '100000001',
            'x-forwarded-for': '10.8.0.1',
          },
        },
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
      // Se responde antes de que el cliente termine de enviar: el cuerpo prometido nunca llega.
      peticion.flushHeaders();
    });
    expect(estado).toBe(413);
    expect((JSON.parse(cuerpo) as { message: string }).message).toBe('El envío supera los 100 MB en total. Adjunta menos fotos o reduce su tamaño.');
  });
});
