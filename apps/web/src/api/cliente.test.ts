import { afterEach, describe, expect, it, vi } from 'vitest';
import { alExpirarSesion, ErrorApi, solicitarJson, solicitarSinContenido } from './cliente';
import { respuestaJson, simularApi, sinContenido } from '../pruebas/ayudas';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente HTTP', () => {
  it('ante un 401 hace una sola renovación compartida por dos peticiones simultáneas y reintenta', async () => {
    let renovada = false;
    const api = simularApi({
      'GET /api/registros': () => (renovada ? respuestaJson(200, { ok: true }) : respuestaJson(401, {})),
      'GET /api/mallas': () => (renovada ? respuestaJson(200, { ok: true }) : respuestaJson(401, {})),
      'POST /api/acceso/renovar': async () => {
        // Una pausa deja que la segunda petición llegue mientras la renovación sigue en curso.
        await new Promise((resolver) => setTimeout(resolver, 10));
        renovada = true;
        return sinContenido();
      },
    });
    const expirada = vi.fn();
    const dejarDeEscuchar = alExpirarSesion(expirada);

    const [a, b] = await Promise.all([
      solicitarJson<{ ok: boolean }>('/api/registros'),
      solicitarJson<{ ok: boolean }>('/api/mallas'),
    ]);
    dejarDeEscuchar();

    expect(a.ok && b.ok).toBe(true);
    expect(api.llamadas.filter((l) => l === 'POST /api/acceso/renovar')).toHaveLength(1);
    expect(api.llamadas.filter((l) => l === 'GET /api/registros')).toHaveLength(2);
    expect(expirada).not.toHaveBeenCalled();
  });

  it('si la renovación da 401 reintenta una vez y, si sigue el 401, avisa que la sesión expiró', async () => {
    const api = simularApi({
      'GET /api/registros': () => respuestaJson(401, { message: 'Sesión no válida' }),
      'POST /api/acceso/renovar': () => respuestaJson(401, {}),
    });
    const expirada = vi.fn();
    const dejarDeEscuchar = alExpirarSesion(expirada);

    await expect(solicitarJson('/api/registros')).rejects.toMatchObject({ estado: 401 });
    dejarDeEscuchar();

    expect(api.llamadas).toEqual(['GET /api/registros', 'POST /api/acceso/renovar', 'GET /api/registros']);
    expect(expirada).toHaveBeenCalledTimes(1);
  });

  it('si la renovación falla pero el reintento funciona (otra pestaña rotó la cookie), no hay expiración', async () => {
    let intentos = 0;
    simularApi({
      'GET /api/registros': () => {
        intentos += 1;
        return intentos === 1 ? respuestaJson(401, {}) : respuestaJson(200, { ok: true });
      },
      'POST /api/acceso/renovar': () => respuestaJson(401, {}),
    });
    const expirada = vi.fn();
    const dejarDeEscuchar = alExpirarSesion(expirada);

    await expect(solicitarJson('/api/registros')).resolves.toEqual({ ok: true });
    dejarDeEscuchar();
    expect(expirada).not.toHaveBeenCalled();
  });

  it('no renueva ni avisa por un 401 de /api/acceso/ingresar', async () => {
    const api = simularApi({
      'POST /api/acceso/ingresar': () => respuestaJson(401, { message: 'Correo o contraseña incorrectos', intentosRestantes: 4 }),
    });
    const expirada = vi.fn();
    const dejarDeEscuchar = alExpirarSesion(expirada);

    const error = await solicitarJson('/api/acceso/ingresar', { metodo: 'POST', cuerpo: { correo: 'a@b.cl' } }).catch(
      (e: unknown) => e,
    );
    dejarDeEscuchar();

    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).cuerpo).toMatchObject({ intentosRestantes: 4 });
    expect(api.llamadas).toEqual(['POST /api/acceso/ingresar']);
    expect(expirada).not.toHaveBeenCalled();
  });

  it('/yo intenta renovar pero su 401 final no cuenta como sesión expirada', async () => {
    const api = simularApi({
      'GET /api/acceso/yo': () => respuestaJson(401, {}),
      'POST /api/acceso/renovar': () => respuestaJson(401, {}),
    });
    const expirada = vi.fn();
    const dejarDeEscuchar = alExpirarSesion(expirada);

    await expect(
      solicitarJson('/api/acceso/yo', { renovarAlExpirar: true, avisarExpiracion: false }),
    ).rejects.toMatchObject({ estado: 401 });
    dejarDeEscuchar();

    expect(api.llamadas).toHaveLength(3);
    expect(expirada).not.toHaveBeenCalled();
  });

  it('solicitarSinContenido acepta un 204 y lanza ErrorApi con el cuerpo en otros estados', async () => {
    simularApi({
      'POST /api/acceso/salir': () => sinContenido(),
      'POST /api/acceso/renovar': () => respuestaJson(500, { message: 'Error interno' }),
    });
    await expect(solicitarSinContenido('/api/acceso/salir', { metodo: 'POST' })).resolves.toBeUndefined();
    await expect(solicitarSinContenido('/api/acceso/renovar', { metodo: 'POST' })).rejects.toMatchObject({
      estado: 500,
      message: 'Error interno',
    });
  });
});
