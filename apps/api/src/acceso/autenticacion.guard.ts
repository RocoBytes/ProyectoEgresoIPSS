import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { COOKIE_ACCESO } from './cookies';
import { CLAVE_PUBLICA } from './roles';
import { TokensService } from './tokens.service';

export const MENSAJE_SESION_INVALIDA = 'Sesión no válida o expirada';

@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean | undefined>(CLAVE_PUBLICA, [contexto.getHandler(), contexto.getClass()]);
    if (publica === true) return true;

    const peticion = contexto.switchToHttp().getRequest<Request>();
    const cookies = peticion.cookies as Record<string, unknown> | undefined;
    const jwt = cookies?.[COOKIE_ACCESO];
    if (typeof jwt !== 'string' || jwt === '') throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    const usuario = await this.tokens.verificarAcceso(jwt);
    if (usuario === null) throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    peticion.usuario = usuario;
    return true;
  }
}
