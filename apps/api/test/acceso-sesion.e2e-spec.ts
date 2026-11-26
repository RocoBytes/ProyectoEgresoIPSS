import { randomUUID } from 'node:crypto';
import { SignJWT, UnsecuredJWT, decodeJwt } from 'jose';
import type { UsuarioActual } from '@ipss/shared';
import { AlcanceService } from '../src/acceso/alcance.service';
import {
  COOKIE_ACCESO,
  COOKIE_RENOVACION,
  HORA,
  JWT_SECRETO_PRUEBAS,
  MINUTO,
  conMigrador,
  cookiesDe,
  crearCarrera,
  crearSector,
  crearUsuario,
  ingresar,
  levantarApp,
  lineaDeCookie,
  pedir,
  sesionDe,
  valorDeCookie,
  type AppDePruebas,
  type Respuesta,
  type Sesion,
  type UsuarioPrueba,
} from './ayudas/acceso';

interface FilaToken {
  hash: string;
  familia: string;
  sesion_iniciada_en: Date;
  expira_en: Date;
  revocado_en: Date | null;
}

describe('sesión: /yo, renovar y salir (e2e contra PostgreSQL real)', () => {
  let ctx: AppDePruebas;

  beforeAll(async () => {
    ctx = await levantarApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const yoConCookies = (cookies: Record<string, string> | undefined): Promise<Respuesta<UsuarioActual>> => pedir(ctx.url, 'GET', '/api/acceso/yo', { cookies });
  const yo = (sesion: Sesion | undefined): Promise<Respuesta<UsuarioActual>> => yoConCookies(sesion === undefined ? undefined : cookiesDe(sesion));
  const renovar = (sesion: Sesion): Promise<Respuesta> => pedir(ctx.url, 'POST', '/api/acceso/renovar', { cookies: { [COOKIE_RENOVACION]: sesion.renovacion } });
  const salir = (sesion: Sesion | undefined): Promise<Respuesta> =>
    pedir(ctx.url, 'POST', '/api/acceso/salir', { cookies: sesion === undefined ? undefined : { [COOKIE_RENOVACION]: sesion.renovacion } });
  const filasDe = (usuario: UsuarioPrueba): Promise<FilaToken[]> =>
    conMigrador(async (c) => (await c.query<FilaToken>('SELECT hash, familia, sesion_iniciada_en, expira_en, revocado_en FROM refresh_token WHERE usuario_id = $1 ORDER BY creado_en, id', [usuario.id])).rows);
  const iniciar = async (usuario: UsuarioPrueba): Promise<Sesion> => {
    const r = await ingresar(ctx.url, usuario);
    expect(r.estado).toBe(200);
    return sesionDe(r);
  };

  describe('GET /yo y el alcance de cada perfil', () => {
    const sufijo = randomUUID();
    const nombres = {
      ingenieria: `Ingeniería ${sufijo}`,
      tecnologias: `Tecnologías ${sufijo}`,
      salud: `Salud ${sufijo}`,
      informatica: `Informática ${sufijo}`,
      ciberseguridad: `Ciberseguridad ${sufijo}`,
      industrial: `Industrial ${sufijo}`,
      enfermeria: `Enfermería ${sufijo}`,
    };
    const ids: Record<keyof typeof nombres, string> = { ingenieria: '', tecnologias: '', salud: '', informatica: '', ciberseguridad: '', industrial: '', enfermeria: '' };
    let sectorial: UsuarioPrueba;
    let deCarrera: UsuarioPrueba;
    let calidad: UsuarioPrueba;

    beforeAll(async () => {
      ids.ingenieria = await crearSector(nombres.ingenieria);
      ids.tecnologias = await crearSector(nombres.tecnologias);
      ids.salud = await crearSector(nombres.salud);
      ids.informatica = await crearCarrera(ids.tecnologias, nombres.informatica);
      ids.ciberseguridad = await crearCarrera(ids.tecnologias, nombres.ciberseguridad);
      ids.industrial = await crearCarrera(ids.ingenieria, nombres.industrial);
      ids.enfermeria = await crearCarrera(ids.salud, nombres.enfermeria);
      sectorial = await crearUsuario('DIRECTOR_SECTORIAL', { sectores: [ids.tecnologias, ids.ingenieria] });
      deCarrera = await crearUsuario('DIRECTOR_CARRERA', { carreras: [ids.informatica] });
      calidad = await crearUsuario('ASEGURAMIENTO_CALIDAD');
    });

    it('Dirección Sectorial: sus sectores y las carreras de esos sectores, con la conjunción en español', async () => {
      const r = await yo(await iniciar(sectorial));
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({
        rol: 'DIRECTOR_SECTORIAL',
        etiquetaRol: 'Dirección Sectorial',
        puedeCrear: true,
        alcance: {
          // Orden alfabético: la base no guarda un orden propio de los sectores (ver informe).
          descripcion: `${nombres.ingenieria} y ${nombres.tecnologias}`,
          sectores: [
            { id: ids.ingenieria, nombre: nombres.ingenieria },
            { id: ids.tecnologias, nombre: nombres.tecnologias },
          ],
          carreras: [
            { id: ids.ciberseguridad, nombre: nombres.ciberseguridad },
            { id: ids.industrial, nombre: nombres.industrial },
            { id: ids.informatica, nombre: nombres.informatica },
          ],
        },
      });
    });

    it('Dirección de Carrera: solo sus carreras', async () => {
      const r = await yo(await iniciar(deCarrera));
      expect(r.cuerpo).toMatchObject({
        rol: 'DIRECTOR_CARRERA',
        etiquetaRol: 'Dirección de Carrera',
        puedeCrear: true,
        alcance: { descripcion: nombres.informatica, sectores: [], carreras: [{ id: ids.informatica, nombre: nombres.informatica }] },
      });
    });

    it('Aseguramiento de la Calidad: consulta todo, no modifica nada y no puede crear', async () => {
      const r = await yo(await iniciar(calidad));
      expect(r.cuerpo).toMatchObject({
        rol: 'ASEGURAMIENTO_CALIDAD',
        etiquetaRol: 'Aseguramiento de la Calidad',
        puedeCrear: false,
        alcance: { descripcion: 'Consulta de todos los sectores', sectores: [], carreras: [] },
      });
    });

    it('devuelve lo mismo que el ingreso y nunca el hash ni los contadores', async () => {
      const ingreso = await ingresar(ctx.url, deCarrera);
      const perfil = await yo(sesionDe(ingreso));
      expect({ ...perfil.cuerpo, idPeticion: undefined }).toEqual({ ...(ingreso.cuerpo as UsuarioActual), idPeticion: undefined });
      expect(JSON.stringify(perfil.cuerpo)).not.toMatch(/argon2|hash|intentos|bloqueado/i);
    });

    it('AlcanceService: carreras modificables y permiso por carrera según el rol', async () => {
      const alcance = ctx.app.get(AlcanceService);
      const u = (usuario: UsuarioPrueba, rol: 'DIRECTOR_SECTORIAL' | 'DIRECTOR_CARRERA' | 'ASEGURAMIENTO_CALIDAD'): { id: string; rol: typeof rol } => ({ id: usuario.id, rol });

      expect((await alcance.carrerasModificables(u(sectorial, 'DIRECTOR_SECTORIAL'))).map((c) => c.id)).toEqual([ids.ciberseguridad, ids.industrial, ids.informatica]);
      expect((await alcance.carrerasModificables(u(deCarrera, 'DIRECTOR_CARRERA'))).map((c) => c.id)).toEqual([ids.informatica]);
      expect(await alcance.carrerasModificables(u(calidad, 'ASEGURAMIENTO_CALIDAD'))).toEqual([]);

      const permisos = async (usuario: ReturnType<typeof u>): Promise<boolean[]> =>
        Promise.all([ids.informatica, ids.ciberseguridad, ids.industrial, ids.enfermeria].map((id) => alcance.puedeModificarCarrera(usuario, id)));
      expect(await permisos(u(sectorial, 'DIRECTOR_SECTORIAL'))).toEqual([true, true, true, false]);
      expect(await permisos(u(deCarrera, 'DIRECTOR_CARRERA'))).toEqual([true, false, false, false]);
      expect(await permisos(u(calidad, 'ASEGURAMIENTO_CALIDAD'))).toEqual([false, false, false, false]);
      expect(await alcance.puedeModificarCarrera(u(sectorial, 'DIRECTOR_SECTORIAL'), randomUUID())).toBe(false);
    });
  });

  describe('autenticación del JWT', () => {
    const clave = new TextEncoder().encode(JWT_SECRETO_PRUEBAS);

    it('sin cookie responde 401 con el mensaje de sesión no válida', async () => {
      const r = await yo(undefined);
      expect(r.estado).toBe(401);
      expect(r.cuerpo).toMatchObject({ statusCode: 401, message: 'Sesión no válida o expirada' });
    });

    it('con el JWT alterado responde 401', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const { acceso } = await iniciar(usuario);
      const [cabecera, , firma] = acceso.split('.');
      const carga = Buffer.from(JSON.stringify({ rol: 'ASEGURAMIENTO_CALIDAD', sub: usuario.id, iss: 'ipss-api', aud: 'ipss-web', exp: 9_999_999_999 })).toString('base64url');
      expect((await yoConCookies({ [COOKIE_ACCESO]: `${cabecera}.${carga}.${firma}` })).estado).toBe(401);
      expect((await yoConCookies({ [COOKIE_ACCESO]: `${acceso.slice(0, -2)}xx` })).estado).toBe(401);
    });

    it('con el JWT vencido responde 401', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const sesion = await iniciar(usuario);
      ctx.reloj.avanzar(15 * MINUTO - 1_000);
      expect((await yo(sesion)).estado).toBe(200);
      ctx.reloj.avanzar(2_000);
      expect((await yo(sesion)).estado).toBe(401);
    });

    it('rechaza JWT sin firma, de otro secreto, de otra audiencia o de otro algoritmo', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const ahora = Math.floor(ctx.reloj.ahora().getTime() / 1000);
      const firmar = (alg: string, opciones: { aud?: string; clave?: Uint8Array } = {}): Promise<string> =>
        new SignJWT({ rol: 'DIRECTOR_CARRERA' })
          .setProtectedHeader({ alg })
          .setSubject(usuario.id)
          .setIssuer('ipss-api')
          .setAudience(opciones.aud ?? 'ipss-web')
          .setExpirationTime(ahora + 900)
          .sign(opciones.clave ?? clave);
      const sinFirma = new UnsecuredJWT({ rol: 'DIRECTOR_CARRERA' }).setSubject(usuario.id).setIssuer('ipss-api').setAudience('ipss-web').setExpirationTime(ahora + 900).encode();

      expect((await yoConCookies({ [COOKIE_ACCESO]: await firmar('HS256') })).estado).toBe(200);
      for (const jwt of [sinFirma, await firmar('HS256', { clave: new TextEncoder().encode('otro-secreto-de-pruebas-de-al-menos-32-caracteres') }), await firmar('HS256', { aud: 'otra' }), await firmar('HS384')]) {
        expect((await yoConCookies({ [COOKIE_ACCESO]: jwt })).estado).toBe(401);
      }
    });

    it('un usuario desactivado deja de recibir /yo aunque su JWT siga vigente', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const sesion = await iniciar(usuario);
      await conMigrador((c) => c.query('UPDATE usuario SET activo = false WHERE id = $1', [usuario.id]));
      expect((await yo(sesion)).estado).toBe(401);
    });
  });

  describe('POST /renovar', () => {
    it('rota el token: revoca el anterior, emite otro en la misma familia y entrega cookies nuevas', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const inicio = ctx.reloj.ahora();
      const primera = await iniciar(usuario);
      ctx.reloj.avanzar(5 * MINUTO);

      const r = await renovar(primera);

      expect(r.estado).toBe(204);
      const segunda = sesionDe(r);
      expect(segunda.renovacion).not.toBe(primera.renovacion);
      expect(segunda.acceso).not.toBe(primera.acceso);
      expect(lineaDeCookie(r, COOKIE_ACCESO)).toEqual(expect.stringContaining('Max-Age=900'));
      expect(lineaDeCookie(r, COOKIE_RENOVACION)).toEqual(expect.stringContaining('Max-Age=900'));
      expect(lineaDeCookie(r, COOKIE_RENOVACION)).toEqual(expect.stringContaining('Path=/api/acceso'));

      const [vieja, nueva] = await filasDe(usuario);
      expect(vieja?.revocado_en).toEqual(ctx.reloj.ahora());
      expect(nueva?.revocado_en).toBeNull();
      expect(nueva?.familia).toBe(vieja?.familia);
      expect(nueva?.sesion_iniciada_en).toEqual(inicio);
      expect(nueva?.expira_en).toEqual(new Date(ctx.reloj.ahora().getTime() + 15 * MINUTO));
      expect((await yo(segunda)).estado).toBe(200);
    });

    it('el JWT nuevo lleva el rol que la base tiene ahora', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const sesion = await iniciar(usuario);
      await conMigrador((c) => c.query(`UPDATE usuario SET rol = 'ASEGURAMIENTO_CALIDAD' WHERE id = $1`, [usuario.id]));
      // El JWT ya emitido conserva el rol viejo hasta que se renueve: así lo evalúan los guards.
      expect(decodeJwt(sesion.acceso)).toMatchObject({ rol: 'DIRECTOR_CARRERA' });

      const nueva = sesionDe(await renovar(sesion));
      expect(decodeJwt(nueva.acceso)).toMatchObject({ rol: 'ASEGURAMIENTO_CALIDAD' });
      expect((await yo(nueva)).cuerpo).toMatchObject({ rol: 'ASEGURAMIENTO_CALIDAD', puedeCrear: false });
    });

    it('reutilizar un token ya rotado pasados 10 s revoca toda la familia', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const primera = await iniciar(usuario);
      ctx.reloj.avanzar(MINUTO);
      const segunda = sesionDe(await renovar(primera));
      ctx.reloj.avanzar(11_000);

      expect((await renovar(primera)).estado).toBe(401);

      expect((await renovar(segunda)).estado).toBe(401);
      expect((await filasDe(usuario)).every((f) => f.revocado_en !== null)).toBe(true);
    });

    it('reutilizarlo dentro de 10 s (dos pestañas) responde 401 sin revocar: el token nuevo sigue sirviendo', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const primera = await iniciar(usuario);
      const segunda = sesionDe(await renovar(primera));
      ctx.reloj.avanzar(5_000);

      expect((await renovar(primera)).estado).toBe(401);

      const filas = await filasDe(usuario);
      expect(filas.map((f) => f.revocado_en !== null)).toEqual([true, false]);
      expect((await renovar(segunda)).estado).toBe(204);
    });

    it('con dos renovaciones simultáneas del mismo token, solo una gana', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const sesion = await iniciar(usuario);

      const resultados = await Promise.all([renovar(sesion), renovar(sesion), renovar(sesion)]);

      expect(resultados.map((r) => r.estado).sort()).toEqual([204, 401, 401]);
      const filas = await filasDe(usuario);
      expect(filas).toHaveLength(2);
      expect(filas.filter((f) => f.revocado_en === null)).toHaveLength(1);
    });

    it('tras 15 minutos sin actividad responde 401', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const sesion = await iniciar(usuario);
      ctx.reloj.avanzar(15 * MINUTO - 1_000);
      const aTiempo = await renovar(sesion);
      expect(aTiempo.estado).toBe(204);

      ctx.reloj.avanzar(15 * MINUTO + 1_000);
      expect((await renovar(sesionDe(aTiempo))).estado).toBe(401);
    });

    it('a las 8 horas desde el ingreso la sesión termina aunque se renueve sin parar', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const inicio = ctx.reloj.ahora();
      let sesion = await iniciar(usuario);
      let ultima: Respuesta | undefined;
      for (let i = 0; i < 34; i++) {
        ctx.reloj.avanzar(14 * MINUTO);
        ultima = await renovar(sesion);
        expect(ultima.estado).toBe(204);
        sesion = sesionDe(ultima);
      }
      // Faltan 4 minutos para las 8 h: la cookie y el JWT no pueden vivir más que eso.
      if (ultima === undefined) throw new Error('no hubo renovaciones');
      expect(lineaDeCookie(ultima, COOKIE_RENOVACION)).toEqual(expect.stringContaining('Max-Age=240'));
      expect(lineaDeCookie(ultima, COOKIE_ACCESO)).toEqual(expect.stringContaining('Max-Age=240'));
      expect((decodeJwt(sesion.acceso).exp ?? 0) - (decodeJwt(sesion.acceso).iat ?? 0)).toBe(240);

      ctx.reloj.avanzar(3 * MINUTO);
      const ultimaPermitida = await renovar(sesion);
      expect(ultimaPermitida.estado).toBe(204);
      expect(lineaDeCookie(ultimaPermitida, COOKIE_RENOVACION)).toEqual(expect.stringContaining('Max-Age=60'));

      ctx.reloj.avanzar(2 * MINUTO);
      expect((await renovar(sesionDe(ultimaPermitida))).estado).toBe(401);
      const filas = await filasDe(usuario);
      expect(Math.max(...filas.map((f) => f.expira_en.getTime()))).toBe(inicio.getTime() + 8 * HORA);
    });

    it('con un usuario desactivado responde 401 y cierra la familia', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const sesion = await iniciar(usuario);
      await conMigrador((c) => c.query('UPDATE usuario SET activo = false WHERE id = $1', [usuario.id]));

      expect((await renovar(sesion)).estado).toBe(401);
      expect((await filasDe(usuario)).every((f) => f.revocado_en !== null)).toBe(true);
    });

    it('con un token desconocido, sin cookie o vacío responde 401', async () => {
      expect((await renovar({ acceso: '', renovacion: 'x'.repeat(43) })).estado).toBe(401);
      expect((await pedir(ctx.url, 'POST', '/api/acceso/renovar')).estado).toBe(401);
      expect((await renovar({ acceso: '', renovacion: '' })).estado).toBe(401);
    });

    it('la cookie de acceso sola no sirve para renovar', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const sesion = await iniciar(usuario);
      const r = await pedir(ctx.url, 'POST', '/api/acceso/renovar', { cookies: { [COOKIE_ACCESO]: sesion.acceso } });
      expect(r.estado).toBe(401);
    });
  });

  describe('POST /salir', () => {
    it('revoca la familia, borra las dos cookies y responde 204', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const primera = await iniciar(usuario);
      const segunda = sesionDe(await renovar(primera));

      const r = await salir(segunda);

      expect(r.estado).toBe(204);
      for (const [nombre, ruta] of [[COOKIE_ACCESO, 'Path=/'], [COOKIE_RENOVACION, 'Path=/api/acceso']] as const) {
        const linea = lineaDeCookie(r, nombre);
        expect(linea).toEqual(expect.stringContaining(`${nombre}=;`));
        expect(linea).toEqual(expect.stringContaining(ruta));
        expect(linea).toEqual(expect.stringContaining('Expires=Thu, 01 Jan 1970'));
      }
      expect((await filasDe(usuario)).every((f) => f.revocado_en !== null)).toBe(true);
      ctx.reloj.avanzar(MINUTO);
      expect((await renovar(segunda)).estado).toBe(401);
    });

    it('sin cookie o con un token desconocido también responde 204 y borra las cookies', async () => {
      const sinCookie = await salir(undefined);
      expect(sinCookie.estado).toBe(204);
      expect(sinCookie.setCookie).toHaveLength(2);
      expect((await salir({ acceso: '', renovacion: 'desconocido' })).estado).toBe(204);
    });

    it('no afecta las sesiones de otro usuario ni otra sesión del mismo usuario', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const otro = await crearUsuario('DIRECTOR_CARRERA');
      const unaSesion = await iniciar(usuario);
      const otraSesion = await iniciar(usuario);
      const deOtro = await iniciar(otro);

      await salir(unaSesion);

      expect((await renovar(otraSesion)).estado).toBe(204);
      expect((await renovar(deOtro)).estado).toBe(204);
    });
  });

  it('el token de renovación viaja solo en su cookie y nunca en el cuerpo', async () => {
    const usuario = await crearUsuario('DIRECTOR_CARRERA');
    const r = await ingresar(ctx.url, usuario);
    expect(JSON.stringify(r.cuerpo)).not.toContain(valorDeCookie(r, COOKIE_RENOVACION));
  });
});
