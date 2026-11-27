import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetalleRegistro } from '@ipss/shared';
import { montar, respuestaJson, simularApi } from '../pruebas/ayudas';
import { PaginaDetalle } from './PaginaDetalle';
import { detalleBase } from './trazabilidad.test';

const rutas = [{ path: '/registros/:id', element: <PaginaDetalle /> }];
const RUTA_CIERRE = 'POST /api/registros/r1/cierre';
const RUTA_ANULACION = 'POST /api/registros/r1/anulacion';

beforeEach(() => {
  // Hoy = 13-06-2026 en Santiago; la sesión del detalle base es del 02-05-2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 13, 15)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const MB = 1024 * 1024;
const archivo = (nombre: string, bytes = 1000) => new File([new Uint8Array(bytes)], nombre);
const cargar = (d: DetalleRegistro, extra: Record<string, () => Response> = {}) =>
  simularApi({ 'GET /api/registros/r1': () => respuestaJson(200, d), ...extra });
const cambiar = (etiqueta: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
};
const adjuntar = (...a: File[]) => {
  fireEvent.change(screen.getByLabelText('Evidencia de cierre'), { target: { files: a } });
};
const errorDeApi = (estado: number, message: string, extra: object = {}) => respuestaJson(estado, { statusCode: estado, message, ...extra });

async function abrirCierre() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar con evidencia' }));
  return screen.getByRole('dialog', { name: 'Cerrar el registro R-2026-001' });
}
async function abrirAnulacion() {
  fireEvent.click(await screen.findByRole('button', { name: 'Anular' }));
  return screen.getByRole('dialog', { name: 'Anular el registro R-2026-001' });
}
const enviarCierre = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar registro' }));
};
const enviarAnulacion = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Anular registro' }));
};

describe('botones del detalle', () => {
  it('un registro abierto con permiso ofrece anular, editar y cerrar con evidencia, en ese orden', async () => {
    cargar(detalleBase());
    montar(rutas, '/registros/r1');
    await screen.findByRole('heading', { name: 'Informática' });
    const nombres = screen.getAllByRole('button').map((b) => b.textContent);
    expect(nombres.filter((n) => ['Anular', 'Editar', 'Cerrar con evidencia'].includes(n ?? ''))).toEqual(['Anular', 'Editar', 'Cerrar con evidencia']);
  });

  it.each([
    ['sin permiso de modificación', detalleBase({ permisos: { puedeModificar: false, motivoConsulta: 'Solo consulta.' } })],
    ['cerrado', detalleBase({ estado: 'CERRADO', fechaEfectiva: '2026-06-10' })],
    ['anulado', detalleBase({ estado: 'ANULADO' })],
  ])('no ofrece cerrar ni anular cuando está %s', async (_caso, detalle) => {
    cargar(detalle);
    montar(rutas, '/registros/r1');
    await screen.findByRole('heading', { name: 'Informática' });
    expect(screen.queryByRole('button', { name: 'Cerrar con evidencia' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull();
  });
});

describe('cerrar un registro', () => {
  it('valida fecha, evidencia y comentario antes de enviar y no manda nada', async () => {
    const api = cargar(detalleBase());
    montar(rutas, '/registros/r1');
    const dialogo = await abrirCierre();
    // La fecha viene con hoy, así que solo falta la evidencia.
    expect(screen.getByLabelText<HTMLInputElement>('Fecha efectiva del cambio').value).toBe('2026-06-13');
    enviarCierre();
    expect(await within(dialogo).findByText('Adjunta la evidencia. Sin ella el registro no se puede cerrar.')).toBeTruthy();

    cambiar('Fecha efectiva del cambio', '');
    enviarCierre();
    expect(await within(dialogo).findByText('Indica la fecha en que el cambio se hizo efectivo.')).toBeTruthy();
    cambiar('Fecha efectiva del cambio', '2026-06-14');
    enviarCierre();
    expect(await within(dialogo).findByText('La fecha efectiva no puede ser posterior a hoy.')).toBeTruthy();
    cambiar('Fecha efectiva del cambio', '2026-05-01');
    enviarCierre();
    expect(await within(dialogo).findByText('La fecha efectiva no puede ser anterior a la sesión (02-05-2026).')).toBeTruthy();

    cambiar('Fecha efectiva del cambio', '2026-06-10');
    cambiar('Comentario (opcional)', 'a'.repeat(2001));
    enviarCierre();
    expect(await within(dialogo).findByText('El comentario admite hasta 2.000 caracteres.')).toBeTruthy();
    expect(api.llamadas).not.toContain(RUTA_CIERRE);
  });

  it.each([
    ['acta.docx', 1000, '“acta.docx” no se puede usar como evidencia. Adjunta un PDF, JPG o PNG.'],
    ['foto.HEIC', 1000, 'Las fotos HEIC del iPhone hay que convertirlas a JPG antes de subirlas.'],
    ['grande.pdf', 21 * MB, '“grande.pdf” pesa 22,0 MB y el máximo es 20 MB. Reduce el archivo o divídelo.'],
  ])('rechaza %s al elegirlo', async (nombre, bytes, mensaje) => {
    cargar(detalleBase());
    montar(rutas, '/registros/r1');
    const dialogo = await abrirCierre();
    adjuntar(archivo(nombre, bytes));
    expect(await within(dialogo).findByText(mensaje)).toBeTruthy();
    expect(screen.queryByRole('button', { name: `Quitar ${nombre}` })).toBeNull();
  });

  it('cierra con la fecha, el comentario y la evidencia, avisa y refresca el detalle', async () => {
    let cerrado = false;
    const api = simularApi({
      'GET /api/registros/r1': () =>
        respuestaJson(
          200,
          cerrado
            ? detalleBase({ estado: 'CERRADO', fechaEfectiva: '2026-06-10', comentarioCierre: 'Publicada' })
            : detalleBase(),
        ),
      [RUTA_CIERRE]: () => {
        cerrado = true;
        return respuestaJson(200, { id: 'r1', correlativo: 'R-2026-001', estado: 'CERRADO' });
      },
    });
    montar(rutas, '/registros/r1');
    await abrirCierre();
    cambiar('Fecha efectiva del cambio', '2026-06-10');
    adjuntar(archivo('malla.pdf', 5000));
    cambiar('Comentario (opcional)', '  Publicada  ');
    enviarCierre();

    expect(await screen.findByText('El registro R-2026-001 quedó cerrado.')).toBeTruthy();
    const formulario = api.cuerpos[api.llamadas.indexOf(RUTA_CIERRE)] as FormData;
    expect(JSON.parse(formulario.get('datos') as string)).toEqual({ fechaEfectiva: '2026-06-10', comentario: 'Publicada' });
    expect((formulario.get('evidencia') as File).name).toBe('malla.pdf');
    expect(await screen.findByText('Cerrado · 10-06-2026')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Cerrar el registro R-2026-001' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar con evidencia' })).toBeNull();
  });

  it('acepta un comentario de 2.000 caracteres con espacios alrededor y la fecha igual a la de la sesión', async () => {
    const api = cargar(detalleBase(), { [RUTA_CIERRE]: () => respuestaJson(200, { id: 'r1', correlativo: 'R-2026-001', estado: 'CERRADO' }) });
    montar(rutas, '/registros/r1');
    await abrirCierre();
    // Mismo día que la sesión (02-05-2026): es el límite inferior permitido.
    cambiar('Fecha efectiva del cambio', '2026-05-02');
    cambiar('Comentario (opcional)', `  ${'a'.repeat(2000)}  `);
    adjuntar(archivo('malla.pdf'));
    enviarCierre();
    await screen.findByText('El registro R-2026-001 quedó cerrado.');
    const formulario = api.cuerpos[api.llamadas.indexOf(RUTA_CIERRE)] as FormData;
    expect(JSON.parse(formulario.get('datos') as string)).toEqual({ fechaEfectiva: '2026-05-02', comentario: 'a'.repeat(2000) });
  });

  it('sin comentario no manda el campo', async () => {
    const api = cargar(detalleBase(), { [RUTA_CIERRE]: () => respuestaJson(200, { id: 'r1', correlativo: 'R-2026-001', estado: 'CERRADO' }) });
    montar(rutas, '/registros/r1');
    await abrirCierre();
    adjuntar(archivo('malla.png'));
    enviarCierre();
    await screen.findByText('El registro R-2026-001 quedó cerrado.');
    const formulario = api.cuerpos[api.llamadas.indexOf(RUTA_CIERRE)] as FormData;
    expect(JSON.parse(formulario.get('datos') as string)).toEqual({ fechaEfectiva: '2026-06-13' });
  });

  it('muestra por campo los errores 400 de la API', async () => {
    cargar(detalleBase(), {
      [RUTA_CIERRE]: () =>
        errorDeApi(400, 'La solicitud tiene datos inválidos', {
          errores: [
            { campo: 'fechaEfectiva', mensaje: 'La fecha efectiva no puede ser posterior a hoy.' },
            { campo: 'evidencia', mensaje: 'Adjunta una sola evidencia.' },
          ],
        }),
    });
    montar(rutas, '/registros/r1');
    const dialogo = await abrirCierre();
    adjuntar(archivo('malla.pdf'));
    enviarCierre();
    expect(await within(dialogo).findByText('La fecha efectiva no puede ser posterior a hoy.')).toBeTruthy();
    expect(within(dialogo).getByText('Adjunta una sola evidencia.')).toBeTruthy();
    expect(screen.queryByText('El registro R-2026-001 quedó cerrado.')).toBeNull();
  });

  it('un 409 muestra el mensaje de la API dentro del diálogo', async () => {
    cargar(detalleBase(), {
      [RUTA_CIERRE]: () => errorDeApi(409, 'El registro R-2026-001 ya está cerrado y no admite modificaciones.'),
    });
    montar(rutas, '/registros/r1');
    const dialogo = await abrirCierre();
    adjuntar(archivo('malla.pdf'));
    enviarCierre();
    expect(await within(dialogo).findByText('El registro R-2026-001 ya está cerrado y no admite modificaciones.')).toBeTruthy();
  });

  it('tras un 409 vuelve a pedir el detalle', async () => {
    const api = cargar(detalleBase(), { [RUTA_CIERRE]: () => errorDeApi(409, 'Ya está cerrado.') });
    montar(rutas, '/registros/r1');
    await abrirCierre();
    adjuntar(archivo('malla.pdf'));
    enviarCierre();
    await screen.findByText('Ya está cerrado.');
    await waitFor(() => expect(api.llamadas.filter((l) => l === 'GET /api/registros/r1')).toHaveLength(2));
  });

  it('un 413 vacío (proxy) se explica como el tope de 20 MB', async () => {
    cargar(detalleBase(), { [RUTA_CIERRE]: () => new Response(null, { status: 413 }) });
    montar(rutas, '/registros/r1');
    const dialogo = await abrirCierre();
    adjuntar(archivo('malla.pdf'));
    enviarCierre();
    expect(await within(dialogo).findByText('El archivo pesa más de 20 MB. Reduce el archivo o divídelo.')).toBeTruthy();
  });

  it('un 413 con el JSON del proxy también se explica como el tope de 20 MB, no como el del envío de sesión', async () => {
    cargar(detalleBase(), {
      [RUTA_CIERRE]: () => errorDeApi(413, 'El envío supera los 100 MB en total. Adjunta menos fotos o reduce su tamaño.'),
    });
    montar(rutas, '/registros/r1');
    const dialogo = await abrirCierre();
    adjuntar(archivo('malla.pdf'));
    enviarCierre();
    expect(await within(dialogo).findByText('El archivo pesa más de 20 MB. Reduce el archivo o divídelo.')).toBeTruthy();
  });

  it('Quitar devuelve la zona para elegir otro archivo', async () => {
    cargar(detalleBase());
    montar(rutas, '/registros/r1');
    await abrirCierre();
    adjuntar(archivo('malla.pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar malla.pdf' }));
    expect(screen.getByRole('button', { name: 'elige un archivo' })).toBeTruthy();
  });
});

describe('anular un registro', () => {
  it('exige un motivo de al menos 10 caracteres y no manda nada si es corto', async () => {
    const api = cargar(detalleBase());
    montar(rutas, '/registros/r1');
    const dialogo = await abrirAnulacion();
    expect(within(dialogo).getByText('La anulación no se puede deshacer.')).toBeTruthy();
    cambiar('Motivo de la anulación', '  corto  ');
    enviarAnulacion();
    expect(await within(dialogo).findByText('Explica el motivo con al menos 10 caracteres.')).toBeTruthy();
    cambiar('Motivo de la anulación', 'a'.repeat(2001));
    enviarAnulacion();
    expect(await within(dialogo).findByText('El motivo admite hasta 2.000 caracteres.')).toBeTruthy();
    expect(api.llamadas).not.toContain(RUTA_ANULACION);
  });

  it('anula con el motivo recortado, avisa y refresca el detalle', async () => {
    let anulado = false;
    const api = simularApi({
      'GET /api/registros/r1': () =>
        respuestaJson(
          200,
          anulado
            ? detalleBase({
                estado: 'ANULADO',
                motivoAnulacion: 'Duplicado del R-2026-002',
                historial: [{ tipo: 'ANULACION', fecha: '2026-06-13T15:00:00Z', usuario: 'Paula Rojas' }],
              })
            : detalleBase(),
        ),
      [RUTA_ANULACION]: () => {
        anulado = true;
        return respuestaJson(200, { id: 'r1', correlativo: 'R-2026-001', estado: 'ANULADO' });
      },
    });
    montar(rutas, '/registros/r1');
    await abrirAnulacion();
    cambiar('Motivo de la anulación', '  Duplicado del R-2026-002  ');
    enviarAnulacion();
    expect(await screen.findByText('El registro R-2026-001 quedó anulado.')).toBeTruthy();
    expect(api.cuerpos[api.llamadas.indexOf(RUTA_ANULACION)]).toEqual({ motivo: 'Duplicado del R-2026-002' });
    expect(await screen.findByText('Anulado. Motivo: Duplicado del R-2026-002')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Anular el registro R-2026-001' })).toBeNull());
  });

  it('muestra el 400 por campo y el 409 como mensaje del diálogo', async () => {
    let intento = 0;
    cargar(detalleBase(), {
      [RUTA_ANULACION]: () => {
        intento += 1;
        return intento === 1
          ? errorDeApi(400, 'La solicitud tiene datos inválidos', { errores: [{ campo: 'motivo', mensaje: 'Explica el motivo con al menos 10 caracteres.' }] })
          : errorDeApi(409, 'El registro R-2026-001 ya está anulado y no admite modificaciones.');
      },
    });
    montar(rutas, '/registros/r1');
    const dialogo = await abrirAnulacion();
    cambiar('Motivo de la anulación', 'Motivo suficientemente largo');
    enviarAnulacion();
    expect(await within(dialogo).findByText('Explica el motivo con al menos 10 caracteres.')).toBeTruthy();
    enviarAnulacion();
    expect(await within(dialogo).findByText('El registro R-2026-001 ya está anulado y no admite modificaciones.')).toBeTruthy();
  });

  it('tras un 409 vuelve a pedir el detalle', async () => {
    const api = cargar(detalleBase(), { [RUTA_ANULACION]: () => errorDeApi(409, 'Ya está anulado.') });
    montar(rutas, '/registros/r1');
    await abrirAnulacion();
    cambiar('Motivo de la anulación', 'Motivo suficientemente largo');
    enviarAnulacion();
    await screen.findByText('Ya está anulado.');
    await waitFor(() => expect(api.llamadas.filter((l) => l === 'GET /api/registros/r1')).toHaveLength(2));
  });
});
