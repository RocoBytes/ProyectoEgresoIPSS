import { SetMetadata } from '@nestjs/common';
import { Rol } from '../generated/prisma/enums';

export const CLAVE_ROLES = 'ipss:roles';
export const CLAVE_PUBLICA = 'ipss:publica';

export const TODOS_LOS_ROLES: readonly Rol[] = Object.values(Rol);

/** Rutas que exigen sesión y uno de estos roles. */
export const Roles = (...roles: Rol[]): MethodDecorator & ClassDecorator => SetMetadata(CLAVE_ROLES, roles);

/**
 * Rutas sin sesión de acceso: el ingreso, /api/salud, y renovar/salir, que se autentican
 * con la cookie de renovación y no con el JWT (que puede haber vencido justo cuando se renueva).
 */
export const Publica = (): MethodDecorator & ClassDecorator => SetMetadata(CLAVE_PUBLICA, true);
