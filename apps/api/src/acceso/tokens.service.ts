import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { CONFIGURACION, type Configuracion } from '../configuracion';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Rol } from '../generated/prisma/enums';
import type { UsuarioAutenticado } from './usuario-autenticado';

export const EMISOR_JWT = 'ipss-api';
export const AUDIENCIA_JWT = 'ipss-web';
export const DURACION_ACCESO_SEGUNDOS = 15 * 60;

const bytesAleatorios = promisify(randomBytes);

export interface RefreshGenerado {
  /** Valor que viaja en la cookie; nunca se guarda. */
  token: string;
  /** SHA-256 en hexadecimal: lo único que se guarda en `refresh_token.hash`. */
  hash: string;
}

@Injectable()
export class TokensService {
  private readonly clave: Uint8Array;

  constructor(
    @Inject(CONFIGURACION) config: Configuracion,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {
    this.clave = new TextEncoder().encode(config.jwtSecreto);
  }

  /**
   * `tope` es el fin absoluto de la sesión (8 h): el JWT nunca vive más allá, aunque falten
   * menos de 15 minutos. Devuelve también los segundos de vida, que usa la cookie.
   */
  async emitirAcceso(usuario: UsuarioAutenticado, tope: Date): Promise<{ jwt: string; segundos: number }> {
    const ahora = this.reloj.ahora();
    const emitidoEn = Math.floor(ahora.getTime() / 1000);
    const segundos = Math.max(0, Math.min(DURACION_ACCESO_SEGUNDOS, Math.floor((tope.getTime() - ahora.getTime()) / 1000)));
    const jwt = await new SignJWT({ rol: usuario.rol })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario.id)
      .setIssuer(EMISOR_JWT)
      .setAudience(AUDIENCIA_JWT)
      .setIssuedAt(emitidoEn)
      .setExpirationTime(emitidoEn + segundos)
      .sign(this.clave);
    return { jwt, segundos };
  }

  /** Devuelve null ante cualquier fallo (firma, algoritmo, emisor, audiencia, vencimiento o forma). */
  async verificarAcceso(jwt: string): Promise<UsuarioAutenticado | null> {
    try {
      const { payload } = await jwtVerify(jwt, this.clave, {
        // Lista cerrada: impide que un token declare "none" u otro algoritmo.
        algorithms: ['HS256'],
        issuer: EMISOR_JWT,
        audience: AUDIENCIA_JWT,
        // La hora la da el Reloj, no el sistema, para que las pruebas controlen el vencimiento.
        currentDate: this.reloj.ahora(),
      });
      const rol = payload['rol'];
      const esRol = (valor: unknown): valor is Rol => Object.values(Rol).some((r) => r === valor);
      if (typeof payload.sub !== 'string' || !esRol(rol)) return null;
      return { id: payload.sub, rol };
    } catch {
      return null;
    }
  }

  async generarRefresh(): Promise<RefreshGenerado> {
    const token = (await bytesAleatorios(32)).toString('base64url');
    return { token, hash: this.hashDe(token) };
  }

  hashDe(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
