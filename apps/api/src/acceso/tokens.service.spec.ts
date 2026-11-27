import { SignJWT, UnsecuredJWT, decodeJwt } from 'jose';
import type { Reloj } from '../comun/reloj';
import type { Configuracion } from '../configuracion';
import { AUDIENCIA_JWT, EMISOR_JWT, TokensService } from './tokens.service';

class RelojControlable implements Reloj {
  constructor(private actual = new Date('2026-11-26T12:00:00.000Z')) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
}

const SECRETO = 'secreto-de-pruebas-de-al-menos-32-caracteres';
const config: Configuracion = { urlBaseDeDatos: 'x', puerto: 0, host: '127.0.0.1', saltosProxy: undefined, jwtSecreto: SECRETO, directorioEvidencias: 'x' };
const usuario = { id: '6f1c1e0e-3b0f-4f0e-9d5e-0a1b2c3d4e5f', rol: 'DIRECTOR_CARRERA' } as const;
const clave = (secreto: string): Uint8Array => new TextEncoder().encode(secreto);
const LEJOS = new Date('2026-11-27T00:00:00.000Z');
const FAMILIA = '0b7a3a5e-8f0e-4c36-8d0e-2f1c6a9b7d11';
const esperado = { ...usuario, familia: FAMILIA };

describe('TokensService', () => {
  let reloj: RelojControlable;
  let tokens: TokensService;

  beforeEach(() => {
    reloj = new RelojControlable();
    tokens = new TokensService(config, reloj);
  });

  // JWT firmado a mano con la clave correcta, para variar un solo campo a la vez.
  const firmar = (opciones: { alg?: string; emisor?: string; audiencia?: string; secreto?: string; rol?: unknown; exp?: number; sinSid?: boolean }): Promise<string> => {
    const emitido = Math.floor(reloj.ahora().getTime() / 1000);
    return new SignJWT({ rol: opciones.rol ?? usuario.rol, ...(opciones.sinSid === true ? {} : { sid: FAMILIA }) })
      .setProtectedHeader({ alg: opciones.alg ?? 'HS256' })
      .setSubject(usuario.id)
      .setIssuer(opciones.emisor ?? EMISOR_JWT)
      .setAudience(opciones.audiencia ?? AUDIENCIA_JWT)
      .setIssuedAt(emitido)
      .setExpirationTime(opciones.exp ?? emitido + 900)
      .sign(clave(opciones.secreto ?? SECRETO));
  };

  describe('acceso', () => {
    it('emite un HS256 de 15 minutos con emisor, audiencia, sub y rol, y lo verifica', async () => {
      const { jwt, segundos } = await tokens.emitirAcceso(usuario, FAMILIA, LEJOS);
      const claims = decodeJwt(jwt);
      expect(segundos).toBe(900);
      expect(claims).toMatchObject({ iss: EMISOR_JWT, aud: AUDIENCIA_JWT, sub: usuario.id, rol: usuario.rol, sid: FAMILIA });
      expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(900);
      expect(JSON.parse(Buffer.from(jwt.split('.')[0] ?? '', 'base64url').toString('utf8'))).toEqual({ alg: 'HS256' });
      expect(await tokens.verificarAcceso(jwt)).toEqual(esperado);
    });

    it('vence a los 15 minutos según el Reloj', async () => {
      const { jwt } = await tokens.emitirAcceso(usuario, FAMILIA, LEJOS);
      reloj.avanzar(15 * 60_000 - 1_000);
      expect(await tokens.verificarAcceso(jwt)).toEqual(esperado);
      reloj.avanzar(2_000);
      expect(await tokens.verificarAcceso(jwt)).toBeNull();
    });

    it('no vive más allá del tope absoluto de la sesión', async () => {
      const tope = new Date(reloj.ahora().getTime() + 240_000);
      const { jwt, segundos } = await tokens.emitirAcceso(usuario, FAMILIA, tope);
      expect(segundos).toBe(240);
      expect((decodeJwt(jwt).exp ?? 0) - (decodeJwt(jwt).iat ?? 0)).toBe(240);
      reloj.avanzar(241_000);
      expect(await tokens.verificarAcceso(jwt)).toBeNull();
    });

    it.each([
      ['audiencia distinta', { audiencia: 'otra-app' }],
      ['emisor distinto', { emisor: 'otro-emisor' }],
      ['algoritmo HS512 (mismo secreto)', { alg: 'HS512' }],
      ['firmado con otro secreto', { secreto: 'otro-secreto-de-pruebas-de-al-menos-32-caracteres' }],
      ['rol desconocido', { rol: 'SUPERADMIN' }],
      ['rol que no es texto', { rol: 7 }],
      ['sin la claim sid (sesión)', { sinSid: true }],
    ])('rechaza un JWT con %s', async (_nombre, opciones) => {
      expect(await tokens.verificarAcceso(await firmar(opciones))).toBeNull();
    });

    it('acepta el mismo JWT cuando solo se cambia a algo válido (control de las pruebas anteriores)', async () => {
      expect(await tokens.verificarAcceso(await firmar({}))).toEqual(esperado);
    });

    it('rechaza un JWT sin firma (alg none)', async () => {
      const sinFirma = new UnsecuredJWT({ rol: usuario.rol }).setSubject(usuario.id).setIssuer(EMISOR_JWT).setAudience(AUDIENCIA_JWT).setExpirationTime('15m').encode();
      expect(await tokens.verificarAcceso(sinFirma)).toBeNull();
    });

    it('rechaza un JWT con el contenido alterado', async () => {
      const [cabecera, , firma] = (await firmar({})).split('.');
      const cargaFalsa = Buffer.from(JSON.stringify({ rol: 'ASEGURAMIENTO_CALIDAD', sub: usuario.id, iss: EMISOR_JWT, aud: AUDIENCIA_JWT, exp: 9_999_999_999 })).toString('base64url');
      expect(await tokens.verificarAcceso(`${cabecera}.${cargaFalsa}.${firma}`)).toBeNull();
    });

    it.each(['', 'basura', 'a.b.c'])('rechaza el texto "%s"', async (texto) => {
      expect(await tokens.verificarAcceso(texto)).toBeNull();
    });
  });

  describe('refresh', () => {
    it('genera 32 bytes aleatorios en base64url y guarda solo su SHA-256 en hexadecimal', async () => {
      const a = await tokens.generarRefresh();
      const b = await tokens.generarRefresh();
      expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(a.token).not.toBe(b.token);
      expect(tokens.hashDe(a.token)).toBe(a.hash);
      expect(a.hash).not.toContain(a.token);
    });
  });
});
