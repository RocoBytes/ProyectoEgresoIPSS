import { Client } from 'pg';
import { URL_API, conMigrador } from './ayudas/acceso';
import { type Escenario, crearEscenario } from './ayudas/escenario';

// Se prueba como ipss_api: son las reglas que la API no puede saltarse.
describe('reglas del objeto según el nivel (CHECK y trigger)', () => {
  let e: Escenario;
  let cliente: Client;
  let sesionId: string;

  beforeAll(async () => {
    e = await crearEscenario();
    sesionId = await conMigrador(async (c) => (await c.query<{ id: string }>("INSERT INTO sesion (canal_id, fecha, instancia, participantes, creado_por) VALUES ($1, '2026-01-10', 'Comité', '{a}', $2) RETURNING id", [e.canal, e.sectorial.id])).rows[0]?.id ?? '');
    cliente = new Client({ connectionString: URL_API });
    await cliente.connect();
  });
  afterAll(() => cliente.end());

  const insertar = (carrera: string, nivel: string, asignatura?: string | null, malla?: string | null, recurso?: string | null) =>
    cliente.query("INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, asignatura_id, version_malla_id, recurso, descripcion, fecha_comprometida, actualizado_por) VALUES ($1, $2, $3, $4, $5, $6, 'Descripción de prueba suficiente', '2026-06-01', $7)", [sesionId, carrera, nivel, asignatura, malla, recurso, e.sectorial.id]);

  it.each([
    ['RECURSO', () => [e.asignaturaA, null, 'Guía']],
    ['ASIGNATURA', () => [e.asignaturaA, null, null]],
    ['MODULO', () => [e.moduloA, null, null]],
    ['MALLA', () => [null, e.mallaA, null]],
    ['PERFIL_INGRESO', () => [null, null, null]],
    ['PERFIL_EGRESO', () => [null, null, null]],
  ])('acepta la forma válida de %s', async (nivel, args) => {
    const [a, m, r] = args();
    await expect(insertar(e.carreraA, nivel, a, m, r)).resolves.toBeDefined();
  });

  it.each([
    ['RECURSO', () => [e.asignaturaA, null, ' a ']],
    ['RECURSO', () => [e.asignaturaA, null, null]],
    ['ASIGNATURA', () => [null, null, null]],
    ['ASIGNATURA', () => [e.asignaturaA, null, 'sobra']],
    ['MODULO', () => [e.moduloA, e.mallaA, null]],
    ['MALLA', () => [null, null, null]],
    ['MALLA', () => [e.asignaturaA, e.mallaA, null]],
    ['PERFIL_INGRESO', () => [e.asignaturaA, null, null]],
    ['PERFIL_EGRESO', () => [null, e.mallaA, null]],
  ])('rechaza una forma inválida de %s con 23514 del CHECK', async (nivel, args) => {
    const [a, m, r] = args();
    await expect(insertar(e.carreraA, nivel, a, m, r)).rejects.toMatchObject({ code: '23514', constraint: 'registro_objeto_segun_nivel' });
  });

  it('rechaza la asignatura o la malla de otra carrera (trigger)', async () => {
    await expect(insertar(e.carreraA, 'ASIGNATURA', e.asignaturaB, null, null)).rejects.toMatchObject({ code: '23514', message: 'La asignatura o el módulo no pertenece a la carrera del registro' });
    await expect(insertar(e.carreraA, 'MALLA', null, e.mallaB, null)).rejects.toMatchObject({ code: '23514', message: 'La versión de malla no pertenece a la carrera del registro' });
  });

  it('rechaza el tipo equivocado (trigger)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- los asimétricos de Jest devuelven any
    await expect(insertar(e.carreraA, 'ASIGNATURA', e.moduloA, null, null)).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('exige una asignatura') });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- los asimétricos de Jest devuelven any
    await expect(insertar(e.carreraA, 'MODULO', e.asignaturaA, null, null)).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('exige un módulo') });
  });
});
