import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Injectable, Logger, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import { Client } from 'pg';
import { Publica } from '../src/acceso/roles';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app';
import { CONFIGURACION, type Configuracion } from '../src/configuracion';
import { PrismaService } from '../src/prisma/prisma.service';

const URL_API = 'postgresql://ipss_api:api_dev@127.0.0.1:55433/ipss';
const URL_MIGRADOR = 'postgresql://ipss_migrador:migrador_dev@127.0.0.1:55433/ipss';

class CuerpoDto {
  @IsString()
  nombre!: string;
}

// Controlador solo de pruebas: se registra únicamente en este módulo de testing, nunca en AppModule.
// Dispara cada error real de la base a través de PrismaService y del filtro global.
// @Publica: estas rutas ejercitan el filtro de errores y no tienen sesión; sin eso el guard global las rechazaría.
@Publica()
@Injectable()
@Controller('pruebas')
class ControladorPruebas {
  constructor(private readonly prisma: PrismaService) {}

  // `via=sql` usa $executeRaw (P2010); sin él, la API de modelos (P2039).
  @Post('cerrar-incompleto/:id')
  async cerrarIncompleto(@Param('id', ParseUUIDPipe) id: string, @Query('via') via?: string): Promise<void> {
    if (via === 'sql') await this.prisma.$executeRaw`UPDATE registro SET estado = 'CERRADO' WHERE id = ${id}::uuid`;
    else await this.prisma.registro.update({ where: { id }, data: { estado: 'CERRADO' } });
  }

  @Post('editar-cerrado/:id')
  async editarCerrado(@Param('id', ParseUUIDPipe) id: string, @Query('via') via?: string): Promise<void> {
    if (via === 'sql') await this.prisma.$executeRaw`UPDATE registro SET descripcion = 'cambio' WHERE id = ${id}::uuid`;
    else await this.prisma.registro.update({ where: { id }, data: { descripcion: 'cambio' } });
  }

  @Post('actualizar-inexistente')
  async actualizarInexistente(): Promise<void> {
    await this.prisma.registro.update({ where: { id: randomUUID() }, data: { descripcion: 'x' } });
  }

  @Post('canal-duplicado')
  async canalDuplicado(@Query('nombre') nombre: string): Promise<void> {
    await this.prisma.canal.create({ data: { nombre } });
  }

  @Post('registro-sin-carrera/:sesionId/:usuarioId')
  async registroSinCarrera(
    @Param('sesionId', ParseUUIDPipe) sesionId: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ): Promise<void> {
    await this.prisma.registro.create({
      data: { sesionId, carreraId: randomUUID(), nivelImpacto: 'RECURSO', descripcion: 'd', fechaComprometida: new Date('2026-12-01'), actualizadoPor: usuarioId },
    });
  }

  @Post('dto')
  recibirDto(@Body() cuerpo: CuerpoDto): CuerpoDto {
    return cuerpo;
  }

  @Get('inesperado')
  inesperado(): never {
    throw new Error('detalle interno secreto: contraseña=hunter2');
  }
}

interface Fixtures {
  registroAbiertoId: string;
  registroCerradoId: string;
  sesionId: string;
  usuarioId: string;
  nombreCanal: string;
}

// Fixtures como migrador y con nombres únicos: las pruebas no dependen del número de filas.
async function crearFixtures(): Promise<Fixtures> {
  const cliente = new Client({ connectionString: URL_MIGRADOR });
  await cliente.connect();
  try {
    const sufijo = randomUUID();
    const insertar = async (sql: string, parametros: unknown[]): Promise<string> => {
      const { rows } = await cliente.query<{ id: string }>(sql, parametros);
      const fila = rows[0];
      if (!fila) throw new Error('El INSERT de la fixture no devolvió fila');
      return fila.id;
    };
    const sectorId = await insertar('INSERT INTO sector (nombre) VALUES ($1) RETURNING id', [`sector-${sufijo}`]);
    const carreraId = await insertar('INSERT INTO carrera (sector_id, nombre) VALUES ($1, $2) RETURNING id', [sectorId, `carrera-${sufijo}`]);
    const nombreCanal = `canal-${sufijo}`;
    const canalId = await insertar('INSERT INTO canal (nombre) VALUES ($1) RETURNING id', [nombreCanal]);
    const usuarioId = await insertar(
      `INSERT INTO usuario (correo, nombre, hash_contrasena, rol) VALUES ($1, 'Usuario de prueba', '$argon2id$hash-de-prueba', 'DIRECTOR_SECTORIAL') RETURNING id`,
      [`${sufijo}@ejemplo.cl`],
    );
    const sesionId = await insertar(
      `INSERT INTO sesion (canal_id, fecha, instancia, creado_por) VALUES ($1, '2026-11-01', 'instancia', $2) RETURNING id`,
      [canalId, usuarioId],
    );
    const nuevoRegistro = (): Promise<string> =>
      insertar(
        `INSERT INTO registro (sesion_id, carrera_id, nivel_impacto, descripcion, fecha_comprometida, actualizado_por)
         VALUES ($1, $2, 'RECURSO', 'descripcion', '2026-12-01', $3) RETURNING id`,
        [sesionId, carreraId, usuarioId],
      );
    const registroAbiertoId = await nuevoRegistro();
    const registroCerradoId = await nuevoRegistro();
    const evidenciaId = await insertar(
      `INSERT INTO evidencia (nombre_original, mime, tamano, sha256, ruta, subido_por)
       VALUES ('a.pdf', 'application/pdf', 1, $1, $2, $3) RETURNING id`,
      ['a'.repeat(64), `ruta-${sufijo}`, usuarioId],
    );
    await cliente.query(
      `UPDATE registro SET estado = 'CERRADO', fecha_efectiva = '2026-12-02', evidencia_cierre_id = $1 WHERE id = $2`,
      [evidenciaId, registroCerradoId],
    );
    return { registroAbiertoId, registroCerradoId, sesionId, usuarioId, nombreCanal };
  } finally {
    await cliente.end();
  }
}

interface CuerpoError {
  statusCode: number;
  message: string | string[];
  idPeticion: string;
}

describe('traducción de errores de la base y de la entrada (e2e contra PostgreSQL real)', () => {
  let app: NestExpressApplication;
  let url: string;
  let fx: Fixtures;

  const enviar = async (metodo: 'GET' | 'POST', ruta: string, cuerpo?: string): Promise<{ estado: number; cuerpo: CuerpoError; idCabecera: string | null }> => {
    const respuesta = await fetch(`${url}/api/pruebas/${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? {} : { 'content-type': 'application/json' },
      body: cuerpo,
    });
    return { estado: respuesta.status, cuerpo: (await respuesta.json()) as CuerpoError, idCabecera: respuesta.headers.get('x-request-id') };
  };

  beforeAll(async () => {
    fx = await crearFixtures();
    const config: Configuracion = { urlBaseDeDatos: URL_API, puerto: 0, host: '127.0.0.1', saltosProxy: undefined, jwtSecreto: 'secreto-de-pruebas-de-al-menos-32-caracteres' };
    const modulo = await Test.createTestingModule({ imports: [AppModule], controllers: [ControladorPruebas] })
      .overrideProvider(CONFIGURACION)
      .useValue(config)
      .compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app, config);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });

  describe.each([
    ['API de modelos (P2039)', ''],
    ['SQL crudo (P2010)', '?via=sql'],
  ])('23514 por %s', (_nombre, consulta) => {
    it('un CHECK (cierre sin fecha efectiva ni evidencia) responde 409 con el mensaje de la base', async () => {
      const r = await enviar('POST', `cerrar-incompleto/${fx.registroAbiertoId}${consulta}`);
      expect(r.estado).toBe(409);
      expect(r.cuerpo.message).toBe('new row for relation "registro" violates check constraint "registro_cierre_completo"');
      expect(r.cuerpo.idPeticion).toBe(r.idCabecera);
    });

    it('un trigger (editar un registro cerrado) responde 409 con el mensaje de la base', async () => {
      const r = await enviar('POST', `editar-cerrado/${fx.registroCerradoId}${consulta}`);
      expect(r.estado).toBe(409);
      expect(r.cuerpo.message).toMatch(/^El registro R-\d{4}-\d{3} está cerrado y no admite modificaciones$/);
    });

    it('no filtra la fila completa del CHECK', async () => {
      const r = await enviar('POST', `cerrar-incompleto/${fx.registroAbiertoId}${consulta}`);
      expect(JSON.stringify(r.cuerpo)).not.toContain('Failing row');
    });
  });

  it('P2025 (actualizar algo que no existe) responde 404', async () => {
    const r = await enviar('POST', 'actualizar-inexistente');
    expect(r.estado).toBe(404);
  });

  it('P2002 (nombre de canal duplicado) responde 409 sin repetir el valor', async () => {
    const r = await enviar('POST', `canal-duplicado?nombre=${fx.nombreCanal}`);
    expect(r.estado).toBe(409);
    expect(JSON.stringify(r.cuerpo)).not.toContain(fx.nombreCanal);
  });

  it('P2003 (carrera inexistente) responde 409', async () => {
    const r = await enviar('POST', `registro-sin-carrera/${fx.sesionId}/${fx.usuarioId}`);
    expect(r.estado).toBe(409);
  });

  it('una propiedad de más en el cuerpo responde 400 (forbidNonWhitelisted)', async () => {
    const r = await enviar('POST', 'dto', JSON.stringify({ nombre: 'a', intruso: 1 }));
    expect(r.estado).toBe(400);
    expect(r.cuerpo.message).toEqual(['property intruso should not exist']);
    expect(r.cuerpo.idPeticion).toBeDefined();
  });

  it('JSON mal formado responde 400 y no 500', async () => {
    const r = await enviar('POST', 'dto', '{"nombre": ');
    expect(r.estado).toBe(400);
    expect(r.cuerpo.idPeticion).toBe(r.idCabecera);
  });

  it('un cuerpo mayor al límite de Express responde 413 y no 500', async () => {
    const r = await enviar('POST', 'dto', JSON.stringify({ nombre: 'a'.repeat(300_000) }));
    expect(r.estado).toBe(413);
    expect(r.cuerpo.idPeticion).toBe(r.idCabecera);
  });

  it('un error inesperado responde 500 con id de petición y sin detalle interno', async () => {
    const silencio = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const r = await enviar('GET', 'inesperado');
      expect(r.estado).toBe(500);
      expect(r.cuerpo).toEqual({ statusCode: 500, message: 'Error interno del servidor', idPeticion: r.idCabecera });
      expect(JSON.stringify(r.cuerpo)).not.toContain('hunter2');
      expect(silencio).toHaveBeenCalledWith(expect.stringContaining(r.cuerpo.idPeticion), expect.any(String));
    } finally {
      silencio.mockRestore();
    }
  });
});
