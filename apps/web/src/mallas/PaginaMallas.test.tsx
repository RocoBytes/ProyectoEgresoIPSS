import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RespuestaMallas, UsuarioActual } from '@ipss/shared';
import { montar, respuestaJson, simularApi, usuarios } from '../pruebas/ayudas';
import { PaginaMallas } from './PaginaMallas';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 5, 13, 15)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const catalogos = {
  sectores: [
    { id: 's1', nombre: 'Tecnologías' },
    { id: 's2', nombre: 'Salud' },
  ],
  carreras: [
    { id: 'c1', nombre: 'Informática', sectorId: 's1' },
    { id: 'c2', nombre: 'Redes', sectorId: 's1' },
    { id: 'c3', nombre: 'Enfermería', sectorId: 's2' },
  ],
  canales: [],
};

const archivoMalla = (id: string, nombre: string) => ({ id, nombreOriginal: nombre, mime: 'application/pdf', tamano: 250_000, sha256: 'a'.repeat(64) });
const conVersiones: RespuestaMallas = {
  versiones: [
    { id: 'v2', anio: 2026, vigenteDesde: '2026-03-01', vigente: true, archivo: archivoMalla('e2', 'malla-2026.pdf'), subidaPor: 'Carla Fuentes', creadaEn: '2026-06-10T15:00:00Z' },
    { id: 'v1', anio: 2024, vigenteDesde: '2024-03-04', vigente: false, archivo: archivoMalla('e1', 'malla-2024.pdf'), subidaPor: 'Matías Sepúlveda', creadaEn: '2024-02-20T15:00:00Z' },
  ],
  permisos: { puedeSubir: true },
};
const sinVersiones: RespuestaMallas = { versiones: [], permisos: { puedeSubir: true } };

const conAlcance = (carreras: Array<{ id: string; nombre: string }>): UsuarioActual => ({
  ...usuarios.DIRECTOR_SECTORIAL,
  alcance: { descripcion: 'Alcance', sectores: [], carreras },
});
const todas = conAlcance(catalogos.carreras.map(({ id, nombre }) => ({ id, nombre })));
const rutas = [{ path: '/mallas', element: <PaginaMallas /> }];

function preparar(usuario: UsuarioActual, mallas: Record<string, () => Response>, entrada = '/mallas') {
  const api = simularApi({
    'GET /api/acceso/yo': () => respuestaJson(200, usuario),
    'GET /api/catalogos': () => respuestaJson(200, catalogos),
    ...mallas,
  });
  const { enrutador, cliente } = montar(rutas, entrada);
  return { api, cliente, busqueda: () => enrutador.state.location.search };
}
const ok = (cuerpo: RespuestaMallas) => () => respuestaJson(200, cuerpo);
const LISTA_C1 = 'GET /api/mallas?carreraId=c1';
const SUBIDA = 'POST /api/mallas';

const archivo = (nombre: string, bytes = 1000) => new File([new Uint8Array(bytes)], nombre);
const cambiar = (etiqueta: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
};
async function abrirDialogo() {
  fireEvent.click(await screen.findByRole('button', { name: 'Subir versión' }));
  return screen.getByRole('dialog', { name: 'Nueva versión de malla' });
}
const enviar = (dialogo: HTMLElement) => {
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Subir versión' }));
};

describe('PaginaMallas', () => {
  it('lista las versiones con la marca Vigente y las fechas en dd-mm-aaaa', async () => {
    preparar(todas, { [LISTA_C1]: ok(conVersiones) });
    expect(await screen.findByText('Malla 2026')).toBeTruthy();
    expect(screen.getByText('Malla 2024')).toBeTruthy();
    expect(screen.getAllByText('Vigente')).toHaveLength(1);
    expect(screen.getByText('01-03-2026')).toBeTruthy();
    expect(screen.getByText('04-03-2024')).toBeTruthy();
    // 15:00 UTC de junio es mediodía menos uno en Santiago (UTC-4).
    expect(screen.getByText('10-06-2026 11:00')).toBeTruthy();
    expect(screen.getByText('Carla Fuentes')).toBeTruthy();
    const descarga = screen.getByRole('link', { name: 'Descargar malla-2026.pdf' });
    expect(descarga.getAttribute('href')).toBe('/api/evidencias/e2/descarga');
  });

  it('sin versiones explica que no se pueden crear registros de nivel malla', async () => {
    preparar(todas, { [LISTA_C1]: ok(sinVersiones) });
    expect(await screen.findByText('Informática aún no tiene versiones de malla')).toBeTruthy();
    expect(screen.getByText('Sin una versión cargada no se pueden crear registros de nivel malla para esta carrera.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('un perfil de consulta ve Solo consulta y no el botón de subir', async () => {
    preparar(usuarios.ASEGURAMIENTO_CALIDAD, {
      [LISTA_C1]: ok({ ...conVersiones, permisos: { puedeSubir: false, motivoConsulta: 'Tu perfil es de consulta: puedes revisar y descargar sus mallas, pero no modificar.' } }),
    });
    expect(await screen.findByText('Solo consulta')).toBeTruthy();
    expect(screen.getByText(/Tu perfil es de consulta/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Subir versión' })).toBeNull();
  });

  it('empieza por la primera carrera del alcance y el selector escribe la carrera en la URL', async () => {
    const { api, busqueda } = preparar(conAlcance([{ id: 'c2', nombre: 'Redes' }]), {
      'GET /api/mallas?carreraId=c2': ok(sinVersiones),
      'GET /api/mallas?carreraId=c3': ok(sinVersiones),
    });
    expect(await screen.findByText('Redes aún no tiene versiones de malla')).toBeTruthy();
    expect(api.llamadas).not.toContain(LISTA_C1);
    // Las carreras se agrupan por sector.
    const selector = screen.getByLabelText('Carrera');
    expect(within(selector).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual(['Tecnologías', 'Salud']);
    fireEvent.change(selector, { target: { value: 'c3' } });
    expect(await screen.findByText('Enfermería aún no tiene versiones de malla')).toBeTruthy();
    expect(busqueda()).toBe('?carrera=c3');
  });

  it('sin alcance usa la primera carrera de la lista, y la URL manda cuando es válida', async () => {
    preparar(conAlcance([]), { [LISTA_C1]: ok(sinVersiones) });
    expect(await screen.findByText('Informática aún no tiene versiones de malla')).toBeTruthy();
    cleanup();
    preparar(todas, { 'GET /api/mallas?carreraId=c3': ok(sinVersiones) }, '/mallas?carrera=c3');
    expect(await screen.findByText('Enfermería aún no tiene versiones de malla')).toBeTruthy();
  });

  it('valida el año, la fecha y el archivo antes de enviar y no manda nada', async () => {
    const api = preparar(todas, { [LISTA_C1]: ok(conVersiones) }).api;
    const dialogo = await abrirDialogo();
    expect(within(dialogo).getByText('Informática')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Año de la malla').value).toBe('2026');
    // El año por defecto ya existe: el cliente lo dice antes de enviar.
    enviar(dialogo);
    expect(await within(dialogo).findByText('Ya existe la malla 2026 de esta carrera.')).toBeTruthy();
    expect(within(dialogo).getByText('Indica desde cuándo rige.')).toBeTruthy();
    expect(within(dialogo).getByText('Adjunta el PDF de la malla.')).toBeTruthy();
    cambiar('Año de la malla', '26');
    enviar(dialogo);
    expect(await within(dialogo).findByText('Escribe el año con cuatro dígitos.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Archivo de la malla'), { target: { files: [archivo('malla.docx')] } });
    expect(await within(dialogo).findByText('“malla.docx” no es un PDF. La malla debe adjuntarse en PDF.')).toBeTruthy();
    expect(api.llamadas).not.toContain(SUBIDA);
  });

  it('sube la versión, avisa y refresca las mallas y los objetos de Nueva sesión', async () => {
    let subida = false;
    const { api, cliente } = preparar(todas, {
      [LISTA_C1]: () => respuestaJson(200, subida ? { ...conVersiones, versiones: [{ ...conVersiones.versiones[0]!, id: 'v3', anio: 2025 }, ...conVersiones.versiones] } : conVersiones),
      [SUBIDA]: () => {
        subida = true;
        return respuestaJson(201, conVersiones.versiones[0]);
      },
    });
    cliente.setQueryData(['objetos', 'c1'], { asignaturas: [], modulos: [], versionesMalla: [] });
    const dialogo = await abrirDialogo();
    cambiar('Año de la malla', '2025');
    cambiar('Vigente desde', '2025-03-03');
    fireEvent.change(screen.getByLabelText('Archivo de la malla'), { target: { files: [archivo('malla-2025.pdf', 5000)] } });
    enviar(dialogo);
    expect(await screen.findByText('La malla 2025 quedó cargada.')).toBeTruthy();
    const formulario = api.cuerpos[api.llamadas.indexOf(SUBIDA)] as FormData;
    expect(JSON.parse(formulario.get('datos') as string)).toEqual({ carreraId: 'c1', anio: 2025, vigenteDesde: '2025-03-03' });
    expect((formulario.get('archivo') as File).name).toBe('malla-2025.pdf');
    expect(await screen.findByText('Malla 2025')).toBeTruthy();
    expect(cliente.getQueryState(['objetos', 'c1'])?.isInvalidated).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nueva versión de malla' })).toBeNull());
  });

  it('muestra por campo los errores 400 de la API, incluido el año repetido', async () => {
    preparar(todas, {
      [LISTA_C1]: ok(conVersiones),
      [SUBIDA]: () =>
        respuestaJson(400, {
          statusCode: 400,
          message: 'La solicitud tiene datos inválidos',
          errores: [
            { campo: 'anio', mensaje: 'Ya existe la malla 2025 de esta carrera.' },
            { campo: 'vigenteDesde', mensaje: 'Indica desde cuándo rige.' },
            { campo: 'archivo', mensaje: 'Adjunta el PDF de la malla.' },
          ],
        }),
    });
    const dialogo = await abrirDialogo();
    cambiar('Año de la malla', '2025');
    cambiar('Vigente desde', '2025-03-03');
    fireEvent.change(screen.getByLabelText('Archivo de la malla'), { target: { files: [archivo('malla.pdf')] } });
    enviar(dialogo);
    expect(await within(dialogo).findByText('Ya existe la malla 2025 de esta carrera.')).toBeTruthy();
    expect(within(dialogo).getByText('Indica desde cuándo rige.')).toBeTruthy();
    expect(within(dialogo).getByText('Adjunta el PDF de la malla.')).toBeTruthy();
  });

  it('un 403 se muestra como aviso del diálogo y un 413 vacío como el tope de 20 MB', async () => {
    let intento = 0;
    preparar(todas, {
      [LISTA_C1]: ok(conVersiones),
      [SUBIDA]: () => {
        intento += 1;
        return intento === 1
          ? respuestaJson(403, { statusCode: 403, message: 'Informática está fuera de tu alcance.' })
          : new Response(null, { status: 413 });
      },
    });
    const dialogo = await abrirDialogo();
    cambiar('Año de la malla', '2025');
    cambiar('Vigente desde', '2025-03-03');
    fireEvent.change(screen.getByLabelText('Archivo de la malla'), { target: { files: [archivo('malla.pdf')] } });
    enviar(dialogo);
    expect(await within(dialogo).findByText('Informática está fuera de tu alcance.')).toBeTruthy();
    enviar(dialogo);
    expect(await within(dialogo).findByText('El archivo pesa más de 20 MB. Reduce el archivo o divídelo.')).toBeTruthy();
  });

  it('si falla el catálogo avisa, no deja el selector en blanco sin explicación y permite reintentar', async () => {
    let falla = true;
    simularApi({
      'GET /api/acceso/yo': () => respuestaJson(200, todas),
      'GET /api/catalogos': () => (falla ? respuestaJson(500, { statusCode: 500, message: 'Error' }) : respuestaJson(200, catalogos)),
      [LISTA_C1]: ok(sinVersiones),
    });
    montar(rutas, '/mallas');
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar las carreras.');
    expect(screen.queryByRole('status')).toBeNull();
    falla = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Informática aún no tiene versiones de malla')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mientras carga el catálogo muestra el indicador de carga', async () => {
    simularApi({
      'GET /api/acceso/yo': () => respuestaJson(200, todas),
      'GET /api/catalogos': () => new Promise<Response>(() => undefined),
    });
    montar(rutas, '/mallas');
    expect((await screen.findByRole('status')).textContent).toContain('Cargando');
  });

  it('si falla la lista de mallas avisa y permite reintentar', async () => {
    let falla = true;
    preparar(todas, { [LISTA_C1]: () => (falla ? respuestaJson(500, { statusCode: 500, message: 'Error' }) : respuestaJson(200, conVersiones)) });
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar las mallas.');
    falla = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Malla 2026')).toBeTruthy();
  });
});
