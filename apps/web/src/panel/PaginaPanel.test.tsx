import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RespuestaPanel } from '@ipss/shared';
import { montar, respuestaJson, simularApi } from '../pruebas/ayudas';
import { PaginaPanel } from './PaginaPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const catalogos = {
  sectores: [
    { id: 's1', nombre: 'Tecnologías' },
    { id: 's2', nombre: 'Salud' },
  ],
  carreras: [
    { id: 'c1', nombre: 'Informática', sectorId: 's1' },
    { id: 'c3', nombre: 'Enfermería', sectorId: 's2' },
  ],
  canales: [{ id: 'k1', nombre: 'Comité sectorial' }],
};

/** Cifras del prototipo para 2026 con hoy = 26-11-2026: 14 ajustes, 9 abiertos (2 vencidos), 4 cerrados de 13 vigentes. */
const panel2026: RespuestaPanel = {
  anio: 2026,
  hoy: '2026-11-26',
  aniosDisponibles: [2026, 2025],
  indicadores: {
    total: 14,
    abiertos: 9,
    vencidos: 2,
    cerrados: 4,
    anulados: 1,
    vigentes: 13,
    enPlazo: 3,
    carrerasConAjustes: 10,
    carrerasEnAlcance: 10,
    totalAnioAnterior: 5,
  },
  porMes: [
    { mes: 1, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
    { mes: 2, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
    { mes: 3, cerrados: 2, abiertos: 1, anulados: 0, total: 3 },
    { mes: 4, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
    { mes: 5, cerrados: 2, abiertos: 2, anulados: 0, total: 4 },
    { mes: 6, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
    { mes: 7, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
    { mes: 8, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
    { mes: 9, cerrados: 0, abiertos: 3, anulados: 1, total: 4 },
    { mes: 10, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
    { mes: 11, cerrados: 0, abiertos: 3, anulados: 0, total: 3 },
    { mes: 12, cerrados: 0, abiertos: 0, anulados: 0, total: 0 },
  ],
  porAnio: [
    { anio: 2026, total: 14, meses: [0, 0, 3, 0, 4, 0, 0, 0, 4, 0, 3, 0] },
    { anio: 2025, total: 5, meses: [0, 1, 0, 2, 0, 0, 1, 0, 0, 1, 0, 0] },
  ],
  porCanal: [
    { id: 'k1', nombre: 'Comité sectorial', total: 8 },
    { id: 'k2', nombre: 'Mesa de empresas', total: 6 },
  ],
  porNivel: [
    { nivel: 'ASIGNATURA', total: 9 },
    { nivel: 'MALLA', total: 5 },
  ],
  porGrupo: [
    { tipo: 'SECTOR', id: 's1', nombre: 'Tecnologías', cerrados: 2, abiertos: 6, anulados: 0, total: 8 },
    { tipo: 'SECTOR', id: 's2', nombre: 'Salud', cerrados: 2, abiertos: 3, anulados: 1, total: 6 },
  ],
  ultimasSesiones: [
    { id: 'se1', fecha: '2026-11-12', instancia: 'Comité de noviembre', canal: 'Comité sectorial', creadoPor: 'Carla Fuentes', ajustes: 3, primerRegistroId: 'r9' },
  ],
};

const panelSector: RespuestaPanel = {
  ...panel2026,
  porGrupo: [{ tipo: 'CARRERA', id: 'c1', nombre: 'Informática', cerrados: 2, abiertos: 6, anulados: 0, total: 8 }],
};

const vacio: RespuestaPanel = {
  ...panel2026,
  indicadores: { ...panel2026.indicadores, total: 0, abiertos: 0, vencidos: 0, cerrados: 0, anulados: 0, vigentes: 0, enPlazo: 0, carrerasConAjustes: 0 },
  porMes: panel2026.porMes.map((m) => ({ mes: m.mes, cerrados: 0, abiertos: 0, anulados: 0, total: 0 })),
  porCanal: [],
  porNivel: [],
  porGrupo: [],
  ultimasSesiones: [],
};

const rutas = [
  { path: '/', element: <PaginaPanel /> },
  { path: '/registros', element: <p>Listado</p> },
  { path: '/registros/:id', element: <p>Detalle</p> },
];

type RespuestaSimulada = RespuestaPanel | (() => Response | Promise<Response>);

function preparar(entrada: string, paneles: Record<string, RespuestaSimulada>) {
  const api = simularApi({
    'GET /api/catalogos': () => respuestaJson(200, catalogos),
    ...Object.fromEntries(
      Object.entries(paneles).map(([ruta, cuerpo]) => [`GET /api/reportes/panel${ruta}`, typeof cuerpo === 'function' ? cuerpo : () => respuestaJson(200, cuerpo)]),
    ),
  });
  const { enrutador, cliente } = montar(rutas, entrada);
  const destino = () => `${enrutador.state.location.pathname}${enrutador.state.location.search}`;
  return { api, destino, cliente };
}

describe('PaginaPanel', () => {
  it('muestra los indicadores y los anillos con las cifras del prototipo', async () => {
    preparar('/', { '': panel2026 });
    const total = await screen.findByRole('button', { name: /Ajustes registrados en 2026/ });
    expect(total.textContent).toContain('14');
    expect(total.textContent).toContain('+9 respecto de 2025');
    const abiertos = screen.getByRole('button', { name: /Ajustes abiertos/ });
    expect(abiertos.textContent).toContain('9');
    expect(abiertos.textContent).toContain('2 vencidos');
    const cerrados = screen.getByRole('button', { name: /Ajustes cerrados con evidencia/ });
    expect(cerrados.textContent).toContain('31 % de los vigentes');
    expect(screen.getByText('Carreras con ajustes')).toBeTruthy();
    expect(screen.getByText('de 10 carreras')).toBeTruthy();
    // La tarjeta de carreras informa, no navega.
    expect(screen.queryByRole('button', { name: /Carreras con ajustes/ })).toBeNull();
    expect(screen.getByText('31 %')).toBeTruthy();
    expect(screen.getByText('75 %')).toBeTruthy();
    expect(screen.getByText('78 %')).toBeTruthy();
    expect(screen.getByText('3 de 4 cierres en la fecha comprometida o antes')).toBeTruthy();
    expect(screen.getByText('7 de 9 abiertos sin vencer')).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '14 ajustes en 2026')).toBeTruthy();
  });

  it('el primer año con ajustes no compara con el anterior', async () => {
    preparar('/', { '': { ...panel2026, indicadores: { ...panel2026.indicadores, totalAnioAnterior: null } } });
    const total = await screen.findByRole('button', { name: /Ajustes registrados en 2026/ });
    expect(total.textContent).toContain('Primer año con ajustes');
    expect(total.textContent).not.toContain('respecto de');
  });

  it('marca como futuros los meses que aún no llegan', async () => {
    preparar('/', { '': panel2026 });
    const tabla = await screen.findByRole('table', { name: 'Ajustes por mes de la sesión en 2026 para todos los sectores' });
    expect(within(tabla).getByRole('rowheader', { name: 'Dic (aún no llega)' })).toBeTruthy();
    expect(within(tabla).getByRole('rowheader', { name: 'Nov' })).toBeTruthy();
  });

  it('un clic en el canal abre el listado con el año y el canal', async () => {
    const { destino } = preparar('/', { '': panel2026 });
    fireEvent.click(await screen.findByRole('button', { name: /^Comité sectorial/ }));
    expect(destino()).toBe('/registros?anio=2026&canal=k1');
  });

  it('los clics del panel llevan el sector y la carrera activos', async () => {
    const { destino } = preparar('/?sector=s1&carrera=c1', { '?sectorId=s1&carreraId=c1': panelSector });
    fireEvent.click(await screen.findByRole('button', { name: /Mesa de empresas/ }));
    expect(destino()).toBe('/registros?anio=2026&sector=s1&carrera=c1&canal=k2');
  });

  it('un clic en el nivel filtra por el valor del enum', async () => {
    const { destino } = preparar('/', { '': panel2026 });
    fireEvent.click(await screen.findByRole('button', { name: /Malla/ }));
    expect(destino()).toBe('/registros?anio=2026&nivel=MALLA');
  });

  it('un clic en la leyenda de la dona filtra por estado', async () => {
    const { destino } = preparar('/', { '': panel2026 });
    fireEvent.click(await screen.findByRole('button', { name: /Cerrados/ }));
    expect(destino()).toBe('/registros?anio=2026&estado=CERRADO');
  });

  it('los indicadores de abiertos y cerrados filtran por estado, y el total por año', async () => {
    const { destino } = preparar('/', { '': panel2026 });
    fireEvent.click(await screen.findByRole('button', { name: /Ajustes abiertos/ }));
    expect(destino()).toBe('/registros?anio=2026&estado=ABIERTO');
  });

  it('un clic en el sector filtra por el id del sector', async () => {
    const { destino } = preparar('/', { '': panel2026 });
    fireEvent.click(await screen.findByRole('button', { name: /Tecnologías/ }));
    expect(destino()).toBe('/registros?anio=2026&sector=s1');
  });

  it('elegir un sector actualiza la URL y el gráfico pasa a carreras', async () => {
    const { destino } = preparar('/', { '': panel2026, '?sectorId=s1': panelSector });
    expect(await screen.findByRole('heading', { name: 'Ajustes por sector' })).toBeTruthy();
    await screen.findByRole('option', { name: 'Tecnologías' });
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 's1' } });
    expect(await screen.findByRole('heading', { name: 'Ajustes por carrera' })).toBeTruthy();
    expect(destino()).toBe('/?sector=s1');
    expect(screen.getByRole('option', { name: 'Todas las del sector' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Informática/ })).toBeTruthy();
  });

  it('elegir una carrera fija su sector, y quitar el sector quita también la carrera', async () => {
    const { destino } = preparar('/', { '': panel2026, '?sectorId=s1&carreraId=c1': panelSector, '?sectorId=s1': panelSector });
    await screen.findByRole('option', { name: 'Informática' });
    fireEvent.change(screen.getByLabelText('Carrera'), { target: { value: 'c1' } });
    await waitFor(() => expect(destino()).toBe('/?carrera=c1&sector=s1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar el filtro Tecnologías' }));
    await waitFor(() => expect(destino()).toBe('/'));
  });

  it('Quitar filtros deja el año y limpia sector y carrera', async () => {
    const { destino } = preparar('/?anio=2025&sector=s1&carrera=c1', {
      '?anio=2025&sectorId=s1&carreraId=c1': { ...panelSector, anio: 2025 },
      '?anio=2025': { ...panel2026, anio: 2025 },
    });
    expect(await screen.findByRole('button', { name: 'Quitar el filtro Informática' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(destino()).toBe('/?anio=2025'));
  });

  it('los botones de año marcan el activo y cambian la URL', async () => {
    const { destino } = preparar('/', { '': panel2026, '?anio=2025': { ...panel2026, anio: 2025 } });
    const actual = await screen.findByRole('button', { name: '2026' });
    expect(actual.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    await waitFor(() => expect(destino()).toBe('/?anio=2025'));
    expect((await screen.findByRole('button', { name: '2025' })).getAttribute('aria-pressed')).toBe('true');
  });

  it('un clic en la tarjeta de un año cambia el año del panel', async () => {
    const { destino } = preparar('/', { '': panel2026, '?anio=2025': { ...panel2026, anio: 2025 } });
    fireEvent.click(await screen.findByRole('button', { name: /^2025.*5.*ajustes/ }));
    await waitFor(() => expect(destino()).toBe('/?anio=2025'));
  });

  it('sin ajustes muestra el aviso, los anillos en guion y los textos vacíos', async () => {
    preparar('/?sector=s1', { '?sectorId=s1': vacio });
    expect(await screen.findByText('Sin ajustes en 2026 para el sector Tecnologías')).toBeTruthy();
    expect(screen.getByText('Los gráficos quedan en cero. Cambia el año o quita un filtro.')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByText('Sin ajustes vigentes')).toBeTruthy();
    expect(screen.getByText('Aún no hay cierres')).toBeTruthy();
    expect(screen.getByText('No quedan ajustes abiertos')).toBeTruthy();
    expect(screen.getAllByText('Sin ajustes en 2026 para el sector Tecnologías.').length).toBeGreaterThan(0);
    expect(screen.getByText('Sin sesiones en 2026 para el sector Tecnologías.')).toBeTruthy();
  });

  it('sin filtros el aviso vacío sugiere elegir otro año', async () => {
    preparar('/', { '': vacio });
    expect(await screen.findByText('Sin ajustes en 2026 para todos los sectores')).toBeTruthy();
    expect(screen.getByText('Los gráficos quedan en cero. Elige otro año.')).toBeTruthy();
  });

  it('una sesión reciente abre su primer registro y el enlace lleva al listado del año', async () => {
    const { destino } = preparar('/', { '': panel2026 });
    expect(await screen.findByText('Comité sectorial · registrada por Carla Fuentes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Comité de noviembre/ }));
    await waitFor(() => expect(destino()).toBe('/registros/r9'));
  });

  it('Ver estos ajustes en el listado conserva el año y los filtros', async () => {
    const { destino } = preparar('/?sector=s1', { '?sectorId=s1': panelSector });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver estos ajustes en el listado' }));
    expect(destino()).toBe('/registros?anio=2026&sector=s1');
  });

  it('el indicador de cerrados filtra por estado y el total lleva solo el año y los filtros del panel', async () => {
    const primero = preparar('/', { '': panel2026 });
    fireEvent.click(await screen.findByRole('button', { name: /Ajustes cerrados con evidencia/ }));
    expect(primero.destino()).toBe('/registros?anio=2026&estado=CERRADO');
    cleanup();
    const segundo = preparar('/?sector=s1', { '?sectorId=s1': panelSector });
    fireEvent.click(await screen.findByRole('button', { name: /Ajustes registrados en 2026/ }));
    expect(segundo.destino()).toBe('/registros?anio=2026&sector=s1');
  });

  it('mientras llegan los datos del filtro nuevo, lo mostrado sigue siendo del filtro anterior y queda bloqueado', async () => {
    let liberar: (r: Response) => void = () => undefined;
    preparar('/', {
      '': panel2026,
      '?sectorId=s1': () =>
        new Promise<Response>((resolver) => {
          liberar = resolver;
        }),
    });
    await screen.findByRole('option', { name: 'Tecnologías' });
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 's1' } });
    // La URL ya cambió, pero las filas siguen siendo de sectores: el título también. jsdom no implementa `inert`, así que no se hace clic aquí:
    // el bloqueo se comprueba por el atributo, que el navegador sí aplica.
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect(document.querySelector('[aria-busy="true"]')?.hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Ajustes por sector' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ajustes por carrera' })).toBeNull();
    liberar(respuestaJson(200, panelSector));
    await screen.findByRole('heading', { name: 'Ajustes por carrera' });
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('al llegar los datos nuevos se quita el estado de carga y los clics usan el filtro nuevo', async () => {
    let liberar: (r: Response) => void = () => undefined;
    const { destino } = preparar('/', {
      '': panel2026,
      '?sectorId=s1': () =>
        new Promise<Response>((resolver) => {
          liberar = resolver;
        }),
    });
    await screen.findByRole('option', { name: 'Tecnologías' });
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 's1' } });
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeNull());
    liberar(respuestaJson(200, panelSector));
    expect(await screen.findByRole('heading', { name: 'Ajustes por carrera' })).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Informática/ }));
    expect(destino()).toBe('/registros?anio=2026&sector=s1&carrera=c1');
  });

  it('si falla la consulta del filtro nuevo avisa, deja los filtros a mano y permite reintentar', async () => {
    let falla = true;
    preparar('/', {
      '': panel2026,
      '?sectorId=s1': () => (falla ? respuestaJson(500, { statusCode: 500, message: 'Error' }) : respuestaJson(200, panelSector)),
    });
    await screen.findByRole('option', { name: 'Tecnologías' });
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 's1' } });
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el panel. Inténtalo de nuevo.');
    // Los filtros siguen ahí para corregir la elección.
    expect(screen.getByLabelText('Sector')).toBeTruthy();
    falla = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Ajustes por carrera' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('si falla una recarga se avisa y se conservan los datos anteriores', async () => {
    let llamadas = 0;
    const { cliente } = preparar('/', {
      '': () => {
        llamadas += 1;
        return llamadas === 1 ? respuestaJson(200, panel2026) : respuestaJson(500, { statusCode: 500, message: 'Error' });
      },
    });
    await screen.findByRole('button', { name: /Ajustes registrados en 2026/ });
    await cliente.invalidateQueries({ queryKey: ['reportes'] });
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el panel');
    expect(screen.getByRole('button', { name: /Ajustes registrados en 2026/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
