import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { RespuestaSalud } from '@ipss/shared';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app';
import { CONFIGURACION, type Configuracion } from '../src/configuracion';

// Base de pruebas que levanta `npm run test:bd` (rol ipss_api, puerto 55433).
const URL_BD_PRUEBAS = 'postgresql://ipss_api:api_dev@127.0.0.1:55433/ipss';
const URL_BD_INALCANZABLE = 'postgresql://ipss_api:api_dev@127.0.0.1:1/ipss';

async function levantar(urlBaseDeDatos: string): Promise<{ app: NestExpressApplication; url: string }> {
  const config: Configuracion = { urlBaseDeDatos, puerto: 0, host: '127.0.0.1', saltosProxy: undefined };
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION)
    .useValue(config)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app, config);
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl() };
}

describe('GET /api/salud', () => {
  describe('con la base de pruebas disponible', () => {
    let app: NestExpressApplication;
    let url: string;

    beforeAll(async () => {
      ({ app, url } = await levantar(URL_BD_PRUEBAS));
    });
    afterAll(async () => {
      await app.close();
    });

    it('responde 200 con el estado de la base', async () => {
      const respuesta = await fetch(`${url}/api/salud`);
      const cuerpo = (await respuesta.json()) as RespuestaSalud;
      expect(respuesta.status).toBe(200);
      expect(cuerpo).toEqual({ estado: 'ok', baseDeDatos: 'ok', verificadoEn: expect.any(String) as string });
      expect(new Date(cuerpo.verificadoEn).toISOString()).toBe(cuerpo.verificadoEn);
    });

    it('envía las cabeceras de helmet y no revela Express', async () => {
      const { headers } = await fetch(`${url}/api/salud`);
      expect(headers.get('x-content-type-options')).toBe('nosniff');
      expect(headers.get('content-security-policy')).toEqual(expect.stringContaining("default-src 'self'"));
      expect(headers.has('x-powered-by')).toBe(false);
    });

    it('genera un X-Request-Id distinto por petición e ignora el que envía el cliente', async () => {
      const primera = await fetch(`${url}/api/salud`);
      const segunda = await fetch(`${url}/api/salud`, { headers: { 'X-Request-Id': 'falsificado' } });
      const idA = primera.headers.get('x-request-id');
      const idB = segunda.headers.get('x-request-id');
      expect(idA).toMatch(/^[0-9a-f-]{36}$/);
      expect(idB).toMatch(/^[0-9a-f-]{36}$/);
      expect(idA).not.toBe(idB);
    });

    it('una ruta inexistente da 404 con id de petición', async () => {
      const respuesta = await fetch(`${url}/api/no-existe`);
      expect(respuesta.status).toBe(404);
      expect(await respuesta.json()).toMatchObject({ statusCode: 404, idPeticion: respuesta.headers.get('x-request-id') });
    });
  });

  it('responde 503 sin_conexion cuando la base es inalcanzable, sin colgarse', async () => {
    const { app, url } = await levantar(URL_BD_INALCANZABLE);
    try {
      const respuesta = await fetch(`${url}/api/salud`);
      expect(respuesta.status).toBe(503);
      expect(await respuesta.json()).toEqual({ estado: 'error', baseDeDatos: 'sin_conexion', verificadoEn: expect.any(String) as string });
    } finally {
      await app.close();
    }
  }, 15_000);
});
