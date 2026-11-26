import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const URL_MIGRADOR = 'postgresql://ipss_migrador:migrador_dev@127.0.0.1:55433/ipss';

// Todo ocurre dentro de una transacción que se revierte: el contador es compartido y las demás
// pruebas esperan folios de tres dígitos, así que esta no puede dejar nada en la base.
describe('correlativo del registro desde el número 1000 (e2e contra PostgreSQL real)', () => {
  let cliente: Client;

  beforeAll(async () => {
    cliente = new Client({ connectionString: URL_MIGRADOR });
    await cliente.connect();
  });
  afterAll(async () => {
    await cliente.end();
  });

  it('mantiene el número completo desde 1000 y no choca con el folio 100', async () => {
    await cliente.query('BEGIN');
    try {
      const uno = async (sql: string, parametros: unknown[] = []): Promise<string> => {
        const fila = (await cliente.query<{ id: string }>(sql, parametros)).rows[0];
        if (!fila) throw new Error('El INSERT de la fixture no devolvió fila');
        return fila.id;
      };
      // El mismo cálculo del año que usa el trigger.
      const anio = (await cliente.query<{ anio: number }>("SELECT extract(year FROM now() AT TIME ZONE 'America/Santiago')::int AS anio")).rows[0]?.anio;
      if (anio === undefined) throw new Error('No se pudo leer el año');
      await cliente.query(
        'INSERT INTO contador_correlativo (anio, ultimo) VALUES ($1, 998) ON CONFLICT (anio) DO UPDATE SET ultimo = 998',
        [anio],
      );

      const sufijo = randomUUID();
      const sectorId = await uno('INSERT INTO sector (nombre) VALUES ($1) RETURNING id', [`sector-${sufijo}`]);
      const carreraId = await uno('INSERT INTO carrera (sector_id, nombre) VALUES ($1, $2) RETURNING id', [sectorId, `carrera-${sufijo}`]);
      const canalId = await uno('INSERT INTO canal (nombre) VALUES ($1) RETURNING id', [`canal-${sufijo}`]);
      const usuarioId = await uno(
        `INSERT INTO usuario (correo, nombre, hash_contrasena, rol) VALUES ($1, 'Usuario de prueba', '$argon2id$hash-de-prueba', 'DIRECTOR_CARRERA') RETURNING id`,
        [`${sufijo}@ejemplo.cl`],
      );
      const sesionId = await uno(
        `INSERT INTO sesion (canal_id, fecha, instancia, creado_por) VALUES ($1, '2026-11-01', 'instancia', $2) RETURNING id`,
        [canalId, usuarioId],
      );

      const emitidos: Array<{ correlativo: string; numero: number }> = [];
      for (let i = 0; i < 3; i += 1) {
        const { rows } = await cliente.query<{ correlativo: string; numero: number }>(
          `INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, descripcion, fecha_comprometida, actualizado_por)
           VALUES ($1, $2, 'PERFIL_EGRESO', 'descripcion', '2026-12-01', $3) RETURNING correlativo, numero`,
          [sesionId, carreraId, usuarioId],
        );
        const fila = rows[0];
        if (!fila) throw new Error('El INSERT del registro no devolvió fila');
        emitidos.push(fila);
      }

      expect(emitidos.map((r) => r.correlativo)).toEqual([`R-${String(anio)}-999`, `R-${String(anio)}-1000`, `R-${String(anio)}-1001`]);
      expect(emitidos.map((r) => r.numero)).toEqual([999, 1000, 1001]);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});
