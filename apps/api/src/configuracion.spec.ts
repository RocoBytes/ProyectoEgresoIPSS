import { cargarConfiguracion } from './configuracion';

describe('cargarConfiguracion', () => {
  const secreto = 's'.repeat(32);
  const base = { DATABASE_URL: 'postgresql://ipss_api:x@127.0.0.1:5432/ipss', JWT_SECRETO: secreto };

  it('aplica los valores por defecto', () => {
    expect(cargarConfiguracion(base)).toEqual({
      urlBaseDeDatos: base.DATABASE_URL,
      puerto: 3000,
      host: '127.0.0.1',
      saltosProxy: undefined,
      jwtSecreto: secreto,
    });
  });

  it('lee puerto, host y saltos de proxy', () => {
    const config = cargarConfiguracion({ ...base, PORT: '8080', HOST: '0.0.0.0', TRUST_PROXY: '1' });
    expect(config).toMatchObject({ puerto: 8080, host: '0.0.0.0', saltosProxy: 1 });
  });

  it('acepta TRUST_PROXY=0 como cero saltos, distinto de no configurado', () => {
    expect(cargarConfiguracion({ ...base, TRUST_PROXY: '0' }).saltosProxy).toBe(0);
  });

  it('exige DATABASE_URL con un mensaje claro', () => {
    expect(() => cargarConfiguracion({})).toThrow('Falta la variable de entorno DATABASE_URL');
    expect(() => cargarConfiguracion({ DATABASE_URL: '  ' })).toThrow('DATABASE_URL');
  });

  it('exige JWT_SECRETO con un mensaje claro', () => {
    expect(() => cargarConfiguracion({ DATABASE_URL: base.DATABASE_URL })).toThrow('Falta la variable de entorno JWT_SECRETO');
    expect(() => cargarConfiguracion({ ...base, JWT_SECRETO: '   ' })).toThrow('JWT_SECRETO');
  });

  it('rechaza un JWT_SECRETO de menos de 32 caracteres y acepta uno de exactamente 32', () => {
    expect(() => cargarConfiguracion({ ...base, JWT_SECRETO: 'x'.repeat(31) })).toThrow('al menos 32 caracteres');
    expect(cargarConfiguracion({ ...base, JWT_SECRETO: 'x'.repeat(32) }).jwtSecreto).toBe('x'.repeat(32));
  });

  it.each(['-1', '1.5', 'true', 'abc', '1e3'])('rechaza TRUST_PROXY=%s', (valor) => {
    expect(() => cargarConfiguracion({ ...base, TRUST_PROXY: valor })).toThrow('TRUST_PROXY');
  });

  it('rechaza un PORT que no es entero', () => {
    expect(() => cargarConfiguracion({ ...base, PORT: 'http' })).toThrow('PORT');
  });
});
