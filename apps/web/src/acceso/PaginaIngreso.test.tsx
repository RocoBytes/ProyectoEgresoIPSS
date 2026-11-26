import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { montar, respuestaJson, simularApi, usuarios } from '../pruebas/ayudas';
import { PaginaIngreso } from './PaginaIngreso';

const rutas = [
  { path: '/ingresar', element: <PaginaIngreso /> },
  { path: '/', element: <p>Panel de prueba</p> },
  { path: '/registros', element: <p>Registros de prueba</p> },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function escribir(correo: string, contrasena: string) {
  fireEvent.change(screen.getByLabelText('Correo institucional'), { target: { value: correo } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: contrasena } });
}

function enviar() {
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

const credencialesIncorrectas = (intentosRestantes: number) => () =>
  respuestaJson(401, { statusCode: 401, message: 'Correo o contraseña incorrectos', intentosRestantes });

describe('PaginaIngreso: validación del formulario', () => {
  it('pide el correo y la contraseña sin llamar a la API', async () => {
    const api = simularApi({});
    montar(rutas, '/ingresar');
    enviar();
    expect(await screen.findByText('Escribe tu correo institucional.')).toBeDefined();
    expect(screen.getByText('Escribe tu contraseña.')).toBeDefined();
    expect(api.llamadas).toHaveLength(0);
  });

  it('avisa cuando el correo está incompleto', async () => {
    const api = simularApi({});
    montar(rutas, '/ingresar');
    escribir('paula.rojas@instituto', 'Demo-2026');
    enviar();
    expect(
      await screen.findByText('El correo no está completo. Debe tener la forma nombre@dominio.'),
    ).toBeDefined();
    expect(screen.getByLabelText('Correo institucional').getAttribute('aria-invalid')).toBe('true');
    expect(api.llamadas).toHaveLength(0);
  });

  it('muestra bajo cada campo los errores 400 de la API', async () => {
    simularApi({
      'POST /api/acceso/ingresar': () =>
        respuestaJson(400, {
          statusCode: 400,
          message: 'La solicitud tiene datos inválidos',
          errores: [
            { campo: 'correo', mensaje: 'El correo es demasiado largo.' },
            { campo: 'contrasena', mensaje: 'La contraseña no puede superar los 128 caracteres.' },
          ],
          idPeticion: 'abc',
        }),
    });
    montar(rutas, '/ingresar');
    escribir('paula.rojas@instituto.example', 'x');
    enviar();
    expect(await screen.findByText('El correo es demasiado largo.')).toBeDefined();
    expect(screen.getByText('La contraseña no puede superar los 128 caracteres.')).toBeDefined();
    expect(screen.getByLabelText('Contraseña').getAttribute('aria-describedby')).toBe('ingreso-contrasena-error');
  });
});

describe('PaginaIngreso: credenciales incorrectas', () => {
  it.each([
    [4, 'Revisa que el correo esté completo y que no tengas activadas las mayúsculas.'],
    [2, 'Te quedan 2 intentos antes de que la cuenta se bloquee por 15 minutos.'],
    [1, 'Te queda 1 intento antes de que la cuenta se bloquee por 15 minutos.'],
  ])('con %i intentos restantes muestra el consejo correspondiente', async (restantes, texto) => {
    simularApi({ 'POST /api/acceso/ingresar': credencialesIncorrectas(restantes) });
    montar(rutas, '/ingresar');
    escribir('paula.rojas@instituto.example', 'mala');
    enviar();
    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('Correo o contraseña incorrectos');
    expect(aviso.textContent).toContain(texto);
  });

  it('limpia la contraseña y devuelve el foco a ese campo', async () => {
    simularApi({ 'POST /api/acceso/ingresar': credencialesIncorrectas(4) });
    montar(rutas, '/ingresar');
    escribir('paula.rojas@instituto.example', 'mala');
    enviar();
    await screen.findByRole('alert');
    const campo = screen.getByLabelText<HTMLInputElement>('Contraseña');
    await waitFor(() => {
      expect(campo.value).toBe('');
      expect(document.activeElement).toBe(campo);
    });
  });
});

describe('PaginaIngreso: bloqueos', () => {
  it('muestra la cuenta regresiva del bloqueo, la actualiza cada segundo y se quita al terminar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-26T15:00:00.000Z'));
    simularApi({
      'POST /api/acceso/ingresar': () =>
        respuestaJson(429, {
          statusCode: 429,
          message: 'Cuenta bloqueada por intentos fallidos',
          bloqueadoHasta: '2026-11-26T15:15:00.000Z',
        }),
    });
    montar(rutas, '/ingresar');
    escribir('paula.rojas@instituto.example', 'mala');
    enviar();

    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('Cuenta bloqueada por intentos fallidos');
    // 15:15 UTC son las 12:15 en Santiago (UTC-3 en verano).
    expect(aviso.textContent).toContain('Podrás intentar de nuevo a las 12:15, en ');
    expect(aviso.textContent).toContain('Si no fuiste tú, avisa al administrador del sistema.');

    const segundosRestantes = () => {
      const [mm, ss] = /(\d\d):(\d\d)\. Si no/.exec(screen.getByRole('alert').textContent)!.slice(1).map(Number);
      return mm! * 60 + ss!;
    };
    const antes = segundosRestantes();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(antes - segundosRestantes()).toBeGreaterThanOrEqual(9);
    expect(antes - segundosRestantes()).toBeLessThanOrEqual(11);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60_000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('con el límite por IP muestra el mensaje de la API', async () => {
    simularApi({
      'POST /api/acceso/ingresar': () =>
        respuestaJson(429, { statusCode: 429, message: 'Demasiados intentos desde esta red. Espera unos minutos.' }),
    });
    montar(rutas, '/ingresar');
    escribir('paula.rojas@instituto.example', 'mala');
    enviar();
    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('Demasiados intentos desde esta red. Espera unos minutos.');
    expect(aviso.textContent).not.toContain('Podrás intentar de nuevo');
  });
});

describe('PaginaIngreso: ingreso correcto', () => {
  it('normaliza el correo, va a la ruta pedida y muestra el aviso de sesión iniciada', async () => {
    const api = simularApi({ 'POST /api/acceso/ingresar': () => respuestaJson(200, usuarios.DIRECTOR_SECTORIAL) });
    const { enrutador } = montar(rutas, '/ingresar?volver=%2Fregistros');
    escribir('  Paula.Rojas@Instituto.example ', 'Demo-2026');
    enviar();
    expect(await screen.findByText('Registros de prueba')).toBeDefined();
    expect(enrutador.state.location.pathname).toBe('/registros');
    expect(api.cuerpos[0]).toEqual({ correo: 'paula.rojas@instituto.example', contrasena: 'Demo-2026' });
    expect(screen.getByText('Sesión iniciada como Dirección Sectorial.')).toBeDefined();
  });

  it('ignora un volver que apunta a otro sitio', async () => {
    simularApi({ 'POST /api/acceso/ingresar': () => respuestaJson(200, usuarios.DIRECTOR_CARRERA) });
    const { enrutador } = montar(rutas, '/ingresar?volver=%2F%2Fevil.example');
    escribir('diego.munoz@instituto.example', 'Demo-2026');
    enviar();
    expect(await screen.findByText('Panel de prueba')).toBeDefined();
    expect(enrutador.state.location.pathname).toBe('/');
  });

  it('muestra "Verificando" y deshabilita el botón mientras espera', async () => {
    let responder: (r: Response) => void = () => undefined;
    simularApi({
      'POST /api/acceso/ingresar': () => new Promise<Response>((resolver) => (responder = resolver)),
    });
    montar(rutas, '/ingresar');
    escribir('paula.rojas@instituto.example', 'Demo-2026');
    enviar();
    const boton = await screen.findByRole('button', { name: 'Verificando' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      responder(respuestaJson(200, usuarios.DIRECTOR_SECTORIAL));
      await Promise.resolve();
    });
    await screen.findByText('Panel de prueba');
  });
});

describe('PaginaIngreso: avisos y controles', () => {
  it('avisa cuando la sesión expiró por inactividad', () => {
    montar(rutas, '/ingresar?motivo=expirada');
    const aviso = screen.getByRole('status');
    expect(aviso.textContent).toContain('Tu sesión expiró por inactividad');
    expect(aviso.textContent).toContain('Inicia sesión de nuevo para continuar.');
  });

  it('avisa cuando la persona cerró sesión', () => {
    montar(rutas, '/ingresar?motivo=salida');
    const aviso = screen.getByRole('status');
    expect(aviso.textContent).toContain('Cerraste sesión');
    expect(aviso.textContent).toContain('Para volver a entrar, ingresa tu correo y tu contraseña.');
  });

  it('muestra y oculta la contraseña', () => {
    montar(rutas, '/ingresar');
    const campo = screen.getByLabelText<HTMLInputElement>('Contraseña');
    const boton = screen.getByRole('button', { name: 'Mostrar contraseña' });
    expect(campo.type).toBe('password');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(boton);
    expect(campo.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('avisa cuando está activado Bloq Mayús', () => {
    montar(rutas, '/ingresar');
    const campo = screen.getByLabelText('Contraseña');
    expect(screen.queryByText('Bloq Mayús está activado.')).toBeNull();
    fireEvent.keyUp(campo, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Bloq Mayús está activado.')).toBeDefined();
    fireEvent.keyUp(campo, { key: 'a', modifierCapsLock: false });
    expect(screen.queryByText('Bloq Mayús está activado.')).toBeNull();
  });

  it('despliega la ayuda de "¿Olvidaste tu contraseña?"', () => {
    montar(rutas, '/ingresar');
    const enlace = screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' });
    expect(enlace.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(enlace);
    expect(enlace.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/La contraseña la restablece el administrador del sistema/)).toBeDefined();
  });
});
