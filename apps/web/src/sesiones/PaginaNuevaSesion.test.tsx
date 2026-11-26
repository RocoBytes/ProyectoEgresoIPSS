import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioActual } from '@ipss/shared';
import { montar, respuestaJson, simularApi, usuarios } from '../pruebas/ayudas';
import { PaginaNuevaSesion } from './PaginaNuevaSesion';

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
  canales: [{ id: 'k1', nombre: 'Comité sectorial' }],
};
const objetos = (conMallas: boolean) => ({
  asignaturas: [{ id: 'a1', nombre: 'Programación' }],
  modulos: [{ id: 'm1', nombre: 'Módulo base' }],
  versionesMalla: conMallas ? [{ id: 'v1', anio: 2024, vigenteDesde: '2024-03-01' }] : [],
});

const con = (carreras: Array<{ id: string; nombre: string }>): UsuarioActual => ({
  ...usuarios.DIRECTOR_SECTORIAL,
  alcance: { descripcion: 'Alcance', sectores: [], carreras },
});
const todas = con(catalogos.carreras.map(({ id, nombre }) => ({ id, nombre })));
const soloInformatica = con([{ id: 'c1', nombre: 'Informática' }]);

function preparar(usuario: UsuarioActual, extra: Parameters<typeof simularApi>[0] = {}, mallas = true) {
  const api = simularApi({
    'GET /api/acceso/yo': () => respuestaJson(200, usuario),
    'GET /api/catalogos': () => respuestaJson(200, catalogos),
    'GET /api/catalogos/carreras/c1/objetos': () => respuestaJson(200, objetos(mallas)),
    'GET /api/catalogos/carreras/c2/objetos': () => respuestaJson(200, objetos(true)),
    ...extra,
  });
  montar([{ path: '/sesiones/nueva', element: <PaginaNuevaSesion /> }, { path: '/registros', element: <p>Listado</p> }], '/sesiones/nueva');
  return api;
}

const cambiar = (etiqueta: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
};
const archivo = (nombre: string, bytes = 1000) => new File([new Uint8Array(bytes)], nombre);
const adjuntar = (etiqueta: string, ...a: File[]) => {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { files: a } });
};

async function llenarValido() {
  // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
  cambiar('Canal', 'k1');
  cambiar('Fecha de la sesión', '2026-01-10');
  cambiar('Nombre de la instancia', 'Comité de enero');
  cambiar('Participantes', 'Ana\nBeto');
  adjuntar('Acta de la sesión', archivo('acta.pdf'));
  cambiar('Nivel de impacto', 'PERFIL_EGRESO');
  cambiar('Descripción de lo observado', 'Actualizar el perfil de egreso con competencias digitales.');
  cambiar('Fecha comprometida', '2026-02-01');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar sesión' }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PaginaNuevaSesion', () => {
  it('un formulario vacío muestra cada mensaje de validación', async () => {
    preparar(todas);
    // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar sesión' }));
    const resumen = await screen.findByRole('alert');
    expect(within(resumen).getByText('No se pudo guardar. Revisa 10 campos:')).toBeTruthy();
    for (const mensaje of [
      'Selecciona el canal por el que llegó la retroalimentación.',
      'Indica la fecha de la sesión.',
      'Escribe el nombre de la instancia.',
      'Anota al menos un participante.',
      'Adjunta el acta en PDF: es la evidencia de origen de la sesión.',
      'Registro 1: selecciona el sector.',
      'Registro 1: selecciona la carrera.',
      'Registro 1: selecciona el nivel de impacto.',
      'Registro 1: describe lo observado con al menos 20 caracteres.',
      'Registro 1: indica la fecha comprometida.',
    ])
      expect(within(resumen).getByText(mensaje)).toBeTruthy();
  });

  it('valida fecha futura, fecha comprometida anterior y objeto faltante', async () => {
    preparar(todas);
    // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
    cambiar('Fecha de la sesión', '2999-01-01');
    cambiar('Sector', 's1');
    cambiar('Carrera', 'c1');
    cambiar('Nivel de impacto', 'MALLA');
    await screen.findByLabelText('Versión de malla');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar sesión' }));
    const resumen = await screen.findByRole('alert');
    expect(within(resumen).getByText('La fecha de la sesión no puede ser posterior a hoy.')).toBeTruthy();
    expect(within(resumen).getByText('Registro 1: selecciona la versión de malla.')).toBeTruthy();
    cambiar('Fecha de la sesión', '2026-03-10');
    cambiar('Fecha comprometida', '2026-03-01');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar sesión' }));
    expect(await screen.findAllByText('Registro 1: la fecha comprometida no puede ser anterior a la sesión.')).toBeTruthy();
  });

  it('al cambiar sector, carrera o nivel se limpian los campos dependientes', async () => {
    preparar(todas);
    // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
    const sector = screen.getByLabelText<HTMLSelectElement>('Sector');
    const carrera = screen.getByLabelText<HTMLSelectElement>('Carrera');
    expect((carrera).disabled).toBe(true);
    cambiar('Sector', 's1');
    expect(Array.from(carrera.options).map((o) => o.text)).toEqual(['Selecciona', 'Informática', 'Redes']);
    cambiar('Carrera', 'c1');
    cambiar('Nivel de impacto', 'ASIGNATURA');
    const objeto = await screen.findByLabelText<HTMLSelectElement>('Asignatura');
    await screen.findByRole('option', { name: 'Programación' });
    cambiar('Asignatura', 'a1');
    expect(objeto.value).toBe('a1');
    cambiar('Nivel de impacto', 'MODULO');
    expect(screen.getByLabelText<HTMLSelectElement>('Módulo').value).toBe('');
    cambiar('Carrera', 'c2');
    expect(screen.getByLabelText<HTMLSelectElement>('Módulo').value).toBe('');
    cambiar('Sector', 's2');
    expect(carrera.value).toBe('');
    expect(sector.value).toBe('s2');
    expect(screen.getByText('Elige primero la carrera y el nivel de impacto.')).toBeTruthy();
  });

  it('con una sola carrera en el alcance, sector y carrera vienen elegidos y deshabilitados', async () => {
    preparar(soloInformatica);
    // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
    const sector = screen.getByLabelText<HTMLSelectElement>('Sector');
    const carrera = screen.getByLabelText<HTMLSelectElement>('Carrera');
    expect([sector.value, sector.disabled, carrera.value, carrera.disabled]).toEqual(['s1', true, 'c1', true]);
  });

  it('un nivel Malla sin versiones lo explica', async () => {
    preparar(soloInformatica, {}, false);
    // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
    cambiar('Nivel de impacto', 'MALLA');
    expect(await screen.findByText('Esta carrera no tiene versiones de malla. Cárgala primero en Mallas.')).toBeTruthy();
  });

  it('agregar y quitar registros', async () => {
    preparar(soloInformatica);
    // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
    expect(screen.queryByRole('button', { name: /Quitar el registro/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar otro registro' }));
    expect(screen.getByRole('button', { name: 'Quitar el registro 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el registro 2' }));
    expect(screen.queryByRole('button', { name: /Quitar el registro/ })).toBeNull();
  });

  it('revisa los archivos por extensión y peso', async () => {
    preparar(soloInformatica);
    // El título también existe en la pantalla de carga: el botón indica que el formulario ya está listo.
  await screen.findByRole('button', { name: 'Guardar sesión' });
    adjuntar('Acta de la sesión', archivo('acta.pdf', 1800));
    expect(screen.getByRole('button', { name: 'Quitar acta.pdf' })).toBeTruthy();
    adjuntar('Fotografías de la sesión', archivo('foto.heic'));
    expect(screen.getByText('No se adjuntó el archivo')).toBeTruthy();
    expect(screen.getByText(/Las fotos HEIC del iPhone hay que convertirlas a JPG/)).toBeTruthy();
    adjuntar('Fotografías de la sesión', archivo('grande.jpg', 21 * 1024 * 1024));
    expect(screen.getByText(/pesa 22,0 MB y el máximo es 20 MB/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Quitar grande.jpg' })).toBeNull();
    adjuntar('Fotografías de la sesión', archivo('ok.png'));
    expect(screen.getByRole('button', { name: 'Quitar ok.png' })).toBeTruthy();
  });

  it('un 400 del servidor se muestra en el campo del registro', async () => {
    preparar(soloInformatica, {
      'POST /api/sesiones': () =>
        respuestaJson(400, {
          message: 'Validation failed',
          errores: [{ campo: 'registros.0.descripcion', mensaje: 'La descripción necesita al menos 20 caracteres.' }],
        }),
    });
    await llenarValido();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y guardar' }));
    const campo = await screen.findAllByText('Registro 1: la descripción necesita al menos 20 caracteres.');
    expect(campo.length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Descripción de lo observado').getAttribute('aria-invalid')).toBe('true');
  });

  it('un 403 muestra el mensaje de la API', async () => {
    preparar(soloInformatica, { 'POST /api/sesiones': () => respuestaJson(403, { message: 'No puedes crear registros en esa carrera.' }) });
    await llenarValido();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y guardar' }));
    expect(await screen.findByText('No puedes crear registros en esa carrera.')).toBeTruthy();
  });

  it('guarda, confirma y muestra la pantalla de éxito', async () => {
    const api = preparar(soloInformatica, {
      'POST /api/sesiones': () =>
        respuestaJson(201, {
          sesionId: 'se1',
          fecha: '2026-01-10',
          instancia: 'Comité de enero',
          registros: [
            { id: 'r1', correlativo: 'R-2026-001', carrera: { id: 'c1', nombre: 'Informática' }, nivelImpacto: 'PERFIL_EGRESO', objeto: 'Perfil de egreso', fechaComprometida: '2026-02-01' },
          ],
        }),
    });
    await llenarValido();
    const dialogo = await screen.findByRole('dialog', { name: 'Guardar la sesión' });
    expect(within(dialogo).getByText(/comprometido para el 01-02-2026/)).toBeTruthy();
    expect(within(dialogo).getByText(/Los registros no se eliminan/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar y guardar' }));
    expect(await screen.findByRole('heading', { name: 'Sesión registrada' })).toBeTruthy();
    expect(screen.getByText('R-2026-001')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar otra sesión' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir al listado' })).toBeTruthy();
    await waitFor(() => expect(api.llamadas).toContain('POST /api/sesiones'));
  });
  it('avisa antes de enviar cuando el acta y las fotos superan los 100 MB y no manda nada', async () => {
    const api = preparar(soloInformatica);
    await screen.findByRole('button', { name: 'Guardar sesión' });
    // Cinco fotos de 20 MB (el máximo por archivo) más el acta: cada archivo cumple el máximo, pero el envío no.
    const MB = 1024 * 1024;
    adjuntar('Fotografías de la sesión', ...[1, 2, 3, 4, 5].map((n) => archivo(`f${String(n)}.jpg`, 20 * MB)));
    await llenarValido();
    expect((await screen.findAllByText('El envío supera los 100 MB en total. Adjunta menos fotos o reduce su tamaño.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog', { name: 'Guardar la sesión' })).toBeNull();
    expect(api.llamadas).not.toContain('POST /api/sesiones');
  });

  it('un 413 sin cuerpo (proxy) muestra el mismo mensaje del envío demasiado grande', async () => {
    preparar(soloInformatica, { 'POST /api/sesiones': () => new Response(null, { status: 413 }) });
    await llenarValido();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y guardar' }));
    expect(await screen.findByText('El envío supera los 100 MB en total. Adjunta menos fotos o reduce su tamaño.')).toBeTruthy();
    expect(screen.queryByText(/Respuesta inesperada/)).toBeNull();
  });
});
