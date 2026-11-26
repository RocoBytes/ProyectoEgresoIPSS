import argon2 from 'argon2';
import { ContrasenasService } from './contrasenas.service';

describe('ContrasenasService', () => {
  const servicio = new ContrasenasService();

  beforeAll(async () => {
    await servicio.onModuleInit();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('guarda argon2id con sal propia: la misma clave da hashes distintos', async () => {
    const a = await servicio.hashear('Clave-1');
    const b = await servicio.hashear('Clave-1');
    expect(a).toMatch(/^\$argon2id\$v=19\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('Clave-1');
  });

  it('verifica la clave correcta y rechaza la incorrecta', async () => {
    const hash = await servicio.hashear('Clave-1');
    expect(await servicio.verificar(hash, 'Clave-1')).toBe(true);
    expect(await servicio.verificar(hash, 'clave-1')).toBe(false);
    expect(await servicio.verificar(hash, '')).toBe(false);
  });

  it('un hash corrupto cuenta como clave incorrecta y no lanza', async () => {
    expect(await servicio.verificar('esto-no-es-un-hash', 'x')).toBe(false);
    expect(await servicio.verificar('', 'x')).toBe(false);
  });

  it('el hash ficticio es argon2id con los mismos parámetros que uno real y siempre da false', async () => {
    const real = await servicio.hashear('Clave-1');
    const verificar = jest.spyOn(argon2, 'verify');
    expect(await servicio.verificarContraFicticio('Clave-1')).toBe(false);
    expect(verificar).toHaveBeenCalledTimes(1);
    const ficticio = String(verificar.mock.calls[0]?.[0]);
    expect(ficticio).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    expect(ficticio.split('$')[3]).toBe(real.split('$')[3]);
  });
});
