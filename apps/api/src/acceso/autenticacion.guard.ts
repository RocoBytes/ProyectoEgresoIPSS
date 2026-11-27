import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RELOJ, type Reloj } from '../comun/reloj';
import { PrismaService } from '../prisma/prisma.service';
import { COOKIE_ACCESO } from './cookies';
import { CLAVE_PUBLICA } from './roles';
import { TokensService } from './tokens.service';

export const MENSAJE_SESION_INVALIDA = 'Sesión no válida o expirada';

@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean | undefined>(CLAVE_PUBLICA, [contexto.getHandler(), contexto.getClass()]);
    if (publica === true) return true;

    const peticion = contexto.switchToHttp().getRequest<Request>();
    const cookies = peticion.cookies as Record<string, unknown> | undefined;
    const jwt = cookies?.[COOKIE_ACCESO];
    if (typeof jwt !== 'string' || jwt === '') throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    const claims = await this.tokens.verificarAcceso(jwt);
    if (claims === null) throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);

    // Una consulta por petición (son unas 10 personas): el JWT solo dice quién es y de qué sesión;
    // si la sesión sigue viva, si el usuario sigue activo y qué rol tiene ahora lo dice la base.
    // Así desactivar a alguien, cambiarle el rol o cerrar sesión rigen de inmediato.
    const sesion = await this.prisma.refreshToken.findFirst({
      where: { familia: claims.familia, usuarioId: claims.id, revocadoEn: null, expiraEn: { gt: this.reloj.ahora() } },
      select: { usuario: { select: { activo: true, rol: true } } },
    });
    if (sesion === null || !sesion.usuario.activo) throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    peticion.usuario = { id: claims.id, rol: sesion.usuario.rol };
    return true;
  }
}
