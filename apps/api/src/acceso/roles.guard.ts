import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Rol } from '../generated/prisma/enums';
import { CLAVE_PUBLICA, CLAVE_ROLES } from './roles';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly registro = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(CLAVE_PUBLICA, objetivos) === true) return true;

    const roles = this.reflector.getAllAndOverride<readonly Rol[] | undefined>(CLAVE_ROLES, objetivos);
    if (roles === undefined) {
      // Falla cerrada: una ruta nueva sin declarar su permiso queda inaccesible en vez de abierta a todos.
      this.registro.error(`Error de programación: ${contexto.getClass().name}.${contexto.getHandler().name} no declara @Roles ni @Publica`);
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    const usuario = contexto.switchToHttp().getRequest<Request>().usuario;
    if (usuario === undefined || !roles.includes(usuario.rol)) throw new ForbiddenException('No tienes permisos para esta acción');
    return true;
  }
}
