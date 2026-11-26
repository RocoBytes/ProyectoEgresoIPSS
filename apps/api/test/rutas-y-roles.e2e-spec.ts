import { Controller, Get, Logger, type Type } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { CLAVE_PUBLICA, CLAVE_ROLES, Publica, Roles, TODOS_LOS_ROLES } from '../src/acceso/roles';
import { CONFIGURACION, type Configuracion } from '../src/configuracion';
import { crearUsuario, ingresar, levantarApp, pedir, sesionDe, cookiesDe, JWT_SECRETO_PRUEBAS, URL_API, type AppDePruebas, type RolPrueba } from './ayudas/acceso';

// Controlador solo de pruebas, registrado únicamente en este módulo de testing.
@Controller('pruebas-roles')
class ControladorRoles {
  @Roles('DIRECTOR_CARRERA')
  @Get('solo-carrera')
  soloCarrera(): { ok: true } {
    return { ok: true };
  }

  @Roles('DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA')
  @Get('directores')
  directores(): { ok: true } {
    return { ok: true };
  }

  @Roles(...TODOS_LOS_ROLES)
  @Get('todos')
  todos(): { ok: true } {
    return { ok: true };
  }

  @Publica()
  @Get('abierta')
  abierta(): { ok: true } {
    return { ok: true };
  }

  // Sin @Roles ni @Publica a propósito: el guard debe negarla.
  @Get('sin-declarar')
  sinDeclarar(): { ok: true } {
    return { ok: true };
  }
}

const config: Configuracion = { urlBaseDeDatos: URL_API, puerto: 0, host: '127.0.0.1', saltosProxy: 1, jwtSecreto: JWT_SECRETO_PRUEBAS };

// Lista los handlers HTTP de los controladores del módulo que no declaran @Roles ni @Publica.
async function handlersSinDeclarar(extra: Type[] = []): Promise<{ total: number; sinDeclarar: string[] }> {
  const modulo = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule], controllers: extra })
    .overrideProvider(CONFIGURACION)
    .useValue(config)
    .compile();
  try {
    const reflector = new Reflector();
    const escaner = new MetadataScanner();
    const sinDeclarar: string[] = [];
    let total = 0;
    for (const envoltorio of modulo.get(DiscoveryService).getControllers()) {
      const instance: unknown = envoltorio.instance;
      const metatype = envoltorio.metatype;
      if (typeof instance !== 'object' || instance === null || metatype === null) continue;
      const prototipo = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const nombre of escaner.getAllMethodNames(prototipo)) {
        const handler = prototipo[nombre];
        // 'path' es el metadato que dejan @Get, @Post...: distingue un handler HTTP de un método auxiliar.
        if (typeof handler !== 'function' || Reflect.getMetadata('path', handler) === undefined) continue;
        total += 1;
        const objetivos = [handler, metatype];
        const declarado = reflector.getAllAndOverride<unknown>(CLAVE_ROLES, objetivos) !== undefined || reflector.getAllAndOverride<unknown>(CLAVE_PUBLICA, objetivos) === true;
        if (!declarado) sinDeclarar.push(`${metatype.name}.${nombre}`);
      }
    }
    return { total, sinDeclarar };
  } finally {
    await modulo.close();
  }
}

describe('guards de roles (e2e)', () => {
  let ctx: AppDePruebas;

  beforeAll(async () => {
    ctx = await levantarApp([ControladorRoles]);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const llamar = async (ruta: string, rol?: RolPrueba): Promise<number> => {
    const cookies = rol === undefined ? undefined : cookiesDe(sesionDe(await ingresar(ctx.url, await crearUsuario(rol))));
    return (await pedir(ctx.url, 'GET', `/api/pruebas-roles/${ruta}`, { cookies })).estado;
  };

  it('una ruta @Roles(DIRECTOR_CARRERA) responde 403 a Aseguramiento de la Calidad y a Dirección Sectorial, y 200 a Dirección de Carrera', async () => {
    expect(await llamar('solo-carrera', 'ASEGURAMIENTO_CALIDAD')).toBe(403);
    expect(await llamar('solo-carrera', 'DIRECTOR_SECTORIAL')).toBe(403);
    expect(await llamar('solo-carrera', 'DIRECTOR_CARRERA')).toBe(200);
  });

  it('una ruta con varios roles admite a cada uno de ellos y rechaza al resto', async () => {
    expect(await llamar('directores', 'DIRECTOR_SECTORIAL')).toBe(200);
    expect(await llamar('directores', 'DIRECTOR_CARRERA')).toBe(200);
    expect(await llamar('directores', 'ASEGURAMIENTO_CALIDAD')).toBe(403);
  });

  it('el 403 lleva un mensaje en español y el id de la petición', async () => {
    const sesion = sesionDe(await ingresar(ctx.url, await crearUsuario('ASEGURAMIENTO_CALIDAD')));
    const r = await pedir(ctx.url, 'GET', '/api/pruebas-roles/solo-carrera', { cookies: cookiesDe(sesion) });
    expect(r.cuerpo).toMatchObject({ statusCode: 403, message: 'No tienes permisos para esta acción', idPeticion: r.cabeceras.get('x-request-id') });
  });

  it('sin sesión, una ruta con @Roles responde 401 y no 403', async () => {
    expect(await llamar('solo-carrera')).toBe(401);
    expect(await llamar('todos')).toBe(401);
  });

  it('TODOS_LOS_ROLES admite a los tres perfiles', async () => {
    for (const rol of ['DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA', 'ASEGURAMIENTO_CALIDAD'] as const) expect(await llamar('todos', rol)).toBe(200);
  });

  it('una ruta @Publica responde sin sesión', async () => {
    expect(await llamar('abierta')).toBe(200);
    expect((await pedir(ctx.url, 'GET', '/api/salud')).estado).toBe(200);
  });

  it('una ruta sin @Roles ni @Publica queda negada (403) y se registra como error de programación', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      expect(await llamar('sin-declarar', 'DIRECTOR_CARRERA')).toBe(403);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('ControladorRoles.sinDeclarar no declara @Roles ni @Publica'));
    } finally {
      error.mockRestore();
    }
  });
});

describe('auditoría de rutas', () => {
  it('todo handler de AppModule declara @Roles o @Publica', async () => {
    const { total, sinDeclarar } = await handlersSinDeclarar();
    expect(sinDeclarar).toEqual([]);
    // Salud y las cuatro de acceso: si el recorrido no ve nada, la auditoría no estaría auditando.
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it('la auditoría detecta un handler sin declarar', async () => {
    const { sinDeclarar } = await handlersSinDeclarar([ControladorRoles]);
    expect(sinDeclarar).toEqual(['ControladorRoles.sinDeclarar']);
  });
});
