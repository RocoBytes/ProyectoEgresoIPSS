import { createHash, randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import type { UsuarioActual } from '@ipss/shared';
import { ContrasenasService } from '../src/acceso/contrasenas.service';
import { MENSAJE_LIMITE_POR_IP } from '../src/acceso/limite-por-ip.guard';
import {
  COOKIE_ACCESO,
  COOKIE_RENOVACION,
  CLAVE_PRUEBAS,
  MINUTO,
  conMigrador,
  crearCarrera,
  crearSector,
  crearUsuario,
  ingresar,
  lineaDeCookie,
  levantarApp,
  pedir,
  sesionDe,
  valorDeCookie,
  type AppDePruebas,
  type Respuesta,
} from './ayudas/acceso';

interface Atributos {
  maxAge?: string;
  path?: string;
  domain?: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

function atributosDe(linea: string): Atributos {
  const partes = linea.split('; ').slice(1);
  const valor = (nombre: string): string | undefined => partes.find((p) => p.toLowerCase().startsWith(`${nombre}=`))?.split('=')[1];
  const marca = (nombre: string): boolean => partes.some((p) => p.toLowerCase() === nombre);
  return { maxAge: valor('max-age'), path: valor('path'), domain: valor('domain'), httpOnly: marca('httponly'), secure: marca('secure'), sameSite: valor('samesite') };
}

interface Paso {
  estado: number;
  cuerpo: Record<string, unknown>;
  retryAfter: string | null;
}

// El idPeticion cambia en cada respuesta; el resto debe ser idéntico entre cuentas reales y falsas.
function paso(r: Respuesta): Paso {
  const cuerpo = Object.fromEntries(Object.entries(r.cuerpo as Record<string, unknown>).filter(([clave]) => clave !== 'idPeticion'));
  return { estado: r.estado, cuerpo, retryAfter: r.cabeceras.get('retry-after') };
}

describe('POST /api/acceso/ingresar (e2e contra PostgreSQL real)', () => {
  let ctx: AppDePruebas;

  beforeAll(async () => {
    ctx = await levantarApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const intentar = (correo: string, contrasena: string, ip?: string): Promise<Respuesta> =>
    pedir(ctx.url, 'POST', '/api/acceso/ingresar', { cuerpo: { correo, contrasena }, ip });

  const correoInexistente = (): string => `${randomUUID()}@ejemplo.cl`;

  const secuenciaEsperada = (): Paso[] => {
    const bloqueadoHasta = new Date(ctx.reloj.ahora().getTime() + 15 * MINUTO).toISOString();
    const incorrectos = [4, 3, 2, 1].map((n): Paso => ({ estado: 401, cuerpo: { statusCode: 401, message: 'Correo o contraseña incorrectos', intentosRestantes: n }, retryAfter: null }));
    return [...incorrectos, { estado: 429, cuerpo: { statusCode: 429, message: 'Cuenta bloqueada por intentos fallidos', bloqueadoHasta }, retryAfter: '900' }];
  };

  const cincoFallos = async (correo: string, contrasena = 'incorrecta'): Promise<Paso[]> => {
    const pasos: Paso[] = [];
    for (let i = 0; i < 5; i++) pasos.push(paso(await intentar(correo, contrasena)));
    return pasos;
  };

  describe('ingreso correcto', () => {
    it('responde 200 con el usuario y fija las dos cookies con todos sus atributos', async () => {
      const sector = await crearSector(`Sector ${randomUUID()}`);
      const nombreCarrera = `Carrera ${randomUUID()}`;
      const carrera = await crearCarrera(sector, nombreCarrera);
      const usuario = await crearUsuario('DIRECTOR_CARRERA', { carreras: [carrera] });

      const r = await ingresar(ctx.url, usuario);

      expect(r.estado).toBe(200);
      expect(r.cuerpo).toEqual({
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: 'DIRECTOR_CARRERA',
        etiquetaRol: 'Dirección de Carrera',
        alcance: { descripcion: nombreCarrera, sectores: [], carreras: [{ id: carrera, nombre: nombreCarrera }] },
        puedeCrear: true,
      } satisfies UsuarioActual);

      const acceso = atributosDe(lineaDeCookie(r, COOKIE_ACCESO));
      expect(acceso).toEqual({ maxAge: '900', path: '/', domain: undefined, httpOnly: true, secure: true, sameSite: 'Strict' });
      const renovacion = atributosDe(lineaDeCookie(r, COOKIE_RENOVACION));
      expect(renovacion).toEqual({ maxAge: '900', path: '/api/acceso', domain: undefined, httpOnly: true, secure: true, sameSite: 'Strict' });
      expect(decodeJwt(valorDeCookie(r, COOKIE_ACCESO))).toMatchObject({ sub: usuario.id, rol: 'DIRECTOR_CARRERA', iss: 'ipss-api', aud: 'ipss-web' });
    });

    it('guarda solo el SHA-256 del refresh token, con su familia y el inicio de la sesión', async () => {
      const usuario = await crearUsuario('ASEGURAMIENTO_CALIDAD');
      const r = await ingresar(ctx.url, usuario);
      const token = valorDeCookie(r, COOKIE_RENOVACION);

      const filas = await conMigrador(
        async (c) =>
          (await c.query<{ hash: string; familia: string }>('SELECT hash, familia, sesion_iniciada_en, expira_en, revocado_en FROM refresh_token WHERE usuario_id = $1', [usuario.id])).rows,
      );
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        hash: createHash('sha256').update(token).digest('hex'),
        sesion_iniciada_en: ctx.reloj.ahora(),
        expira_en: new Date(ctx.reloj.ahora().getTime() + 15 * MINUTO),
        revocado_en: null,
      });
      expect(String(filas[0]?.familia)).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(filas)).not.toContain(token);
    });

    it('normaliza el correo: mayúsculas y espacios no crean otra cuenta', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const r = await intentar(`  ${usuario.correo.toUpperCase()} `, CLAVE_PRUEBAS);
      expect(r.estado).toBe(200);
      expect((r.cuerpo as UsuarioActual).correo).toBe(usuario.correo);
    });

    it('un ingreso correcto reinicia el conteo de fallos', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      await intentar(usuario.correo, 'mal');
      await intentar(usuario.correo, 'mal');
      expect((await ingresar(ctx.url, usuario)).estado).toBe(200);
      expect(paso(await intentar(usuario.correo, 'mal')).cuerpo).toMatchObject({ intentosRestantes: 4 });
      const { rows } = await conMigrador((c) => c.query('SELECT intentos_fallidos FROM usuario WHERE id = $1', [usuario.id]));
      expect(rows[0]).toEqual({ intentos_fallidos: 1 });
    });
  });

  describe('fallos y bloqueo', () => {
    it('contraseña incorrecta y correo inexistente dan exactamente la misma secuencia de cinco respuestas', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const real = await cincoFallos(usuario.correo);
      const falso = await cincoFallos(correoInexistente());

      expect(real).toEqual(secuenciaEsperada());
      expect(falso).toEqual(real);
    });

    it('un usuario inactivo se comporta como credenciales incorrectas, incluso con la contraseña correcta', async () => {
      const inactivo = await crearUsuario('DIRECTOR_CARRERA', { activo: false });
      const r = await ingresar(ctx.url, inactivo);
      expect(r.setCookie).toEqual([]);
      expect(paso(r)).toEqual(secuenciaEsperada()[0]);

      const resto = await cincoFallos(inactivo.correo, CLAVE_PRUEBAS);
      // Ya había un fallo: la secuencia arranca en 3 restantes y el cuarto intento más bloquea.
      expect(resto.map((p) => p.estado)).toEqual([401, 401, 401, 429, 429]);
      expect(resto[0]?.cuerpo).toMatchObject({ intentosRestantes: 3 });
      const sesiones = await conMigrador(async (c) => (await c.query('SELECT 1 FROM refresh_token WHERE usuario_id = $1', [inactivo.id])).rowCount);
      expect(sesiones).toBe(0);
    });

    it('con la cuenta bloqueada responde 429 aunque la contraseña sea la correcta, y vuelve a entrar a los 15 minutos', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      await cincoFallos(usuario.correo);

      const bloqueado = await ingresar(ctx.url, usuario);
      expect(bloqueado.estado).toBe(429);
      expect(bloqueado.setCookie).toEqual([]);
      expect(paso(bloqueado)).toEqual(secuenciaEsperada()[4]);

      ctx.reloj.avanzar(15 * MINUTO - 1_000);
      expect((await ingresar(ctx.url, usuario)).estado).toBe(429);

      ctx.reloj.avanzar(2_000);
      const libre = await ingresar(ctx.url, usuario);
      expect(libre.estado).toBe(200);
      const { rows } = await conMigrador((c) => c.query('SELECT intentos_fallidos, bloqueado_hasta FROM usuario WHERE id = $1', [usuario.id]));
      expect(rows[0]).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
    });

    it('tras el bloqueo, un correo inexistente también se libera a los 15 minutos y vuelve a contar desde cero', async () => {
      const correo = correoInexistente();
      await cincoFallos(correo);
      expect(paso(await intentar(correo, CLAVE_PRUEBAS)).estado).toBe(429);
      ctx.reloj.avanzar(15 * MINUTO + 1_000);
      expect(paso(await intentar(correo, 'otra'))).toEqual(secuenciaEsperada()[0]);
    });

    it('el bloqueo de una cuenta no afecta a las demás', async () => {
      const a = await crearUsuario('DIRECTOR_CARRERA');
      const b = await crearUsuario('DIRECTOR_CARRERA');
      await cincoFallos(a.correo);
      expect((await ingresar(ctx.url, b)).estado).toBe(200);
    });

    it('para un correo inexistente gasta una verificación contra el hash ficticio; para uno real, no', async () => {
      const ficticio = jest.spyOn(ctx.app.get(ContrasenasService), 'verificarContraFicticio');
      try {
        const usuario = await crearUsuario('DIRECTOR_CARRERA');
        await intentar(usuario.correo, 'mal');
        expect(ficticio).not.toHaveBeenCalled();
        await intentar(correoInexistente(), 'mal');
        expect(ficticio).toHaveBeenCalledTimes(1);
      } finally {
        ficticio.mockRestore();
      }
    });
  });

  describe('ventana de intentos y ráfagas', () => {
    it('tras 2 fallos y 16 minutos, el siguiente fallo vuelve a dar 4 intentos restantes: igual en una cuenta real y en una inexistente', async () => {
      const real = await crearUsuario('DIRECTOR_CARRERA');
      const falso = correoInexistente();
      for (const correo of [real.correo, falso]) {
        await intentar(correo, 'mal');
        await intentar(correo, 'mal');
      }
      ctx.reloj.avanzar(16 * MINUTO);
      const deReal = paso(await intentar(real.correo, 'mal'));
      const deFalso = paso(await intentar(falso, 'mal'));
      expect(deReal).toEqual(secuenciaEsperada()[0]);
      expect(deFalso).toEqual(deReal);
    });

    it('con exactamente 15 minutos el intento anterior todavía cuenta, igual en ambos casos', async () => {
      const real = await crearUsuario('DIRECTOR_CARRERA');
      const falso = correoInexistente();
      for (const correo of [real.correo, falso]) await intentar(correo, 'mal');
      ctx.reloj.avanzar(15 * MINUTO);
      const deReal = paso(await intentar(real.correo, 'mal'));
      const deFalso = paso(await intentar(falso, 'mal'));
      expect(deReal.cuerpo).toMatchObject({ intentosRestantes: 3 });
      expect(deFalso).toEqual(deReal);
    });

    it('una ráfaga de 10 intentos erróneos y uno correcto nunca verifica más de 5 contraseñas ni deja entrar', async () => {
      const usuario = await crearUsuario('DIRECTOR_CARRERA');
      const contrasenas = ctx.app.get(ContrasenasService);
      const verificarReal = contrasenas.verificar.bind(contrasenas);
      let abrir: () => void = () => undefined;
      const compuerta = new Promise<void>((resolver) => {
        abrir = resolver;
      });
      // Retiene las verificaciones hasta que todas las reservas están hechas: así el resultado no depende del orden de llegada.
      const verificar = jest.spyOn(contrasenas, 'verificar').mockImplementation(async (hash, contrasena) => {
        await compuerta;
        return verificarReal(hash, contrasena);
      });
      try {
        const intentos = [...Array<string>(10).fill('incorrecta'), CLAVE_PRUEBAS].map((contrasena) => intentar(usuario.correo, contrasena));
        for (let i = 0; i < 100; i++) {
          const { rows } = await conMigrador((c) => c.query<{ bloqueado_hasta: Date | null }>('SELECT bloqueado_hasta FROM usuario WHERE id = $1', [usuario.id]));
          if (rows[0]?.bloqueado_hasta != null) break;
          await new Promise((resolver) => setTimeout(resolver, 50));
        }
        abrir();
        const respuestas = await Promise.all(intentos);

        expect(verificar.mock.calls.length).toBeLessThanOrEqual(5);
        expect(respuestas.filter((r) => r.estado === 200)).toHaveLength(0);
        expect(respuestas.every((r) => r.setCookie.length === 0)).toBe(true);
        expect(respuestas.filter((r) => r.estado === 429).length).toBeGreaterThanOrEqual(6);
        const { rows } = await conMigrador((c) => c.query<{ bloqueado_hasta: Date | null }>('SELECT bloqueado_hasta FROM usuario WHERE id = $1', [usuario.id]));
        expect(rows[0]?.bloqueado_hasta).not.toBeNull();
        expect((await ingresar(ctx.url, usuario)).estado).toBe(429);
      } finally {
        abrir();
        verificar.mockRestore();
      }
    }, 30_000);
  });

  describe('errores 400 con formato por campo', () => {
    it('un correo mal formado trae el texto del prototipo y el id de la petición', async () => {
      const r = await pedir(ctx.url, 'POST', '/api/acceso/ingresar', { cuerpo: { correo: 'no-es-un-correo', contrasena: 'x' } });
      expect(r.estado).toBe(400);
      expect(r.cuerpo).toEqual({
        statusCode: 400,
        message: 'La solicitud tiene datos inválidos',
        errores: [{ campo: 'correo', mensaje: 'El correo no está completo. Debe tener la forma nombre@dominio.' }],
        idPeticion: r.cabeceras.get('x-request-id'),
      });
    });

    it('correo y contraseña vacíos o ausentes piden cada dato con su propio texto', async () => {
      const vacios = await pedir(ctx.url, 'POST', '/api/acceso/ingresar', { cuerpo: { correo: '  ', contrasena: '' } });
      expect(vacios.cuerpo).toMatchObject({
        errores: expect.arrayContaining([
          { campo: 'correo', mensaje: 'Escribe tu correo institucional.' },
          { campo: 'contrasena', mensaje: 'Escribe tu contraseña.' },
        ]) as unknown[],
      });
      const ausentes = await pedir(ctx.url, 'POST', '/api/acceso/ingresar', { cuerpo: {} });
      expect((ausentes.cuerpo as { errores: unknown[] }).errores).toEqual([
        { campo: 'correo', mensaje: 'Escribe tu correo institucional.' },
        { campo: 'contrasena', mensaje: 'Escribe tu contraseña.' },
      ]);
    });

    it('una propiedad de más sigue siendo 400, con "Campo no permitido"', async () => {
      const r = await pedir(ctx.url, 'POST', '/api/acceso/ingresar', { cuerpo: { correo: 'a@ejemplo.cl', contrasena: 'x', rol: 'ADMIN' } });
      expect(r.estado).toBe(400);
      expect((r.cuerpo as { errores: unknown[] }).errores).toEqual([{ campo: 'rol', mensaje: 'Campo no permitido' }]);
    });
  });

  describe('entrada no válida', () => {
    it.each([
      ['correo sin forma de correo', { correo: 'no-es-un-correo', contrasena: 'x' }],
      ['correo de más de 254 caracteres', { correo: `${'a'.repeat(250)}@ejemplo.cl`, contrasena: 'x' }],
      ['contraseña vacía', { correo: 'a@ejemplo.cl', contrasena: '' }],
      ['contraseña de más de 256 caracteres', { correo: 'a@ejemplo.cl', contrasena: 'x'.repeat(257) }],
      ['sin contraseña', { correo: 'a@ejemplo.cl' }],
      ['propiedad de más', { correo: 'a@ejemplo.cl', contrasena: 'x', rol: 'ADMIN' }],
      ['contraseña que no es texto', { correo: 'a@ejemplo.cl', contrasena: 123 }],
    ])('responde 400 con %s', async (_nombre, cuerpo) => {
      const r = await pedir(ctx.url, 'POST', '/api/acceso/ingresar', { cuerpo });
      expect(r.estado).toBe(400);
    });
  });

  describe('límite por IP', () => {
    it('con trust proxy 1, la IP 21 en 15 minutos recibe 429 con su propio mensaje y otra IP no se ve afectada', async () => {
      const ip = '198.51.100.1';
      const estados: number[] = [];
      // Un correo distinto cada vez: así ninguna cuenta (real o falsa) llega a su bloqueo propio.
      for (let i = 0; i < 20; i++) estados.push((await intentar(correoInexistente(), 'x', ip)).estado);
      expect(estados).toEqual(Array<number>(20).fill(401));

      const excedida = await intentar(correoInexistente(), 'x', ip);
      expect(excedida.estado).toBe(429);
      expect(excedida.cuerpo).toMatchObject({ statusCode: 429, message: MENSAJE_LIMITE_POR_IP });
      expect(excedida.cuerpo).not.toHaveProperty('bloqueadoHasta');
      expect(Number(excedida.cabeceras.get('retry-after'))).toBeGreaterThan(0);

      const otra = await intentar(correoInexistente(), 'x', '198.51.100.2');
      expect(otra.estado).toBe(401);
    }, 30_000);

    it('el mensaje del límite por IP no es el del bloqueo de cuenta', () => {
      expect(MENSAJE_LIMITE_POR_IP).not.toBe('Cuenta bloqueada por intentos fallidos');
    });
  });

  it('el ingreso de sesionDe() entrega un par de cookies reutilizable', async () => {
    const usuario = await crearUsuario('ASEGURAMIENTO_CALIDAD');
    const sesion = sesionDe(await ingresar(ctx.url, usuario));
    expect(sesion.acceso.split('.')).toHaveLength(3);
    expect(sesion.renovacion).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
