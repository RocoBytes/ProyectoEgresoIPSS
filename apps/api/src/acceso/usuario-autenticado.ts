import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Rol } from '../generated/prisma/enums';

/** Identidad verificada del JWT; no consulta la base, así que un cambio de rol rige al renovar. */
export interface UsuarioAutenticado {
  id: string;
  rol: Rol;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioAutenticado;
  }
}

/** Entrega al handler el usuario que dejó el AutenticacionGuard. */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
  const usuario = contexto.switchToHttp().getRequest<Request>().usuario;
  // Solo falta en una ruta @Publica, y ahí este decorador no tiene sentido: es un error de programación.
  if (usuario === undefined) throw new Error('@UsuarioActual() se usó en una ruta sin sesión');
  return usuario;
});
