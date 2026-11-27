import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { stream } from 'exceljs';
import type { Response } from 'express';
import type { NivelImpacto } from '@ipss/shared';
import { aFechaBd, deFechaBd, hoyEnSantiago } from '../comun/fecha-texto';
import { textoDelObjeto } from '../comun/objeto-registro';
import { RELOJ, type Reloj } from '../comun/reloj';
import { PrismaService } from '../prisma/prisma.service';
import type { ListarRegistrosDto } from './dto/listar-registros.dto';
import { condicionesDeRegistros, ORDEN_DE_REGISTROS } from './filtros-registros';

export const MAXIMO_FILAS_EXPORTACION = 20_000;
const TAMANO_LOTE = 1000;
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const NIVELES: Readonly<Record<NivelImpacto, string>> = {
  RECURSO: 'Recurso',
  ASIGNATURA: 'Asignatura',
  MODULO: 'Módulo',
  MALLA: 'Malla',
  PERFIL_INGRESO: 'Perfil de ingreso',
  PERFIL_EGRESO: 'Perfil de egreso',
};
const ESTADOS = { ABIERTO: 'Abierto', CERRADO: 'Cerrado', ANULADO: 'Anulado' } as const;

const COLUMNAS: ReadonlyArray<{ titulo: string; ancho: number }> = [
  { titulo: 'N°', ancho: 14 },
  { titulo: 'Año', ancho: 7 },
  { titulo: 'Fecha de la sesión', ancho: 16 },
  { titulo: 'Instancia', ancho: 30 },
  { titulo: 'Canal', ancho: 26 },
  { titulo: 'Sector', ancho: 24 },
  { titulo: 'Carrera', ancho: 34 },
  { titulo: 'Nivel de impacto', ancho: 18 },
  { titulo: 'Objeto afectado', ancho: 36 },
  { titulo: 'Recurso', ancho: 24 },
  { titulo: 'Descripción', ancho: 60 },
  { titulo: 'Fecha comprometida', ancho: 18 },
  { titulo: 'Estado', ancho: 11 },
  { titulo: 'Vencido', ancho: 9 },
  { titulo: 'Fecha efectiva', ancho: 15 },
  { titulo: 'Comentario de cierre', ancho: 40 },
  { titulo: 'Motivo de anulación', ancho: 40 },
  { titulo: 'Registrado por', ancho: 26 },
  { titulo: 'Registrado el', ancho: 18 },
];

const ddmmaaaa = (fecha: string): string => fecha.split('-').reverse().join('-');
const FORMATO_SANTIAGO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Marca de tiempo en Santiago como `dd-mm-aaaa hh:mm`. */
function marcaEnSantiago(fecha: Date): string {
  const p = Object.fromEntries(FORMATO_SANTIAGO.formatToParts(fecha).map((x) => [x.type, x.value]));
  return `${p['day'] ?? ''}-${p['month'] ?? ''}-${p['year'] ?? ''} ${p['hour'] ?? ''}:${p['minute'] ?? ''}`;
}

/** Exportación a Excel (RF-10): las mismas filas y el mismo orden que el listado filtrado, sin paginar. */
@Injectable()
export class ExportacionRegistrosService {
  private readonly registro = new Logger(ExportacionRegistrosService.name);
  /** Público para que una prueba pueda bajarlo sin crear miles de filas. */
  maximoFilas = MAXIMO_FILAS_EXPORTACION;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async exportar(filtros: ListarRegistrosDto, respuesta: Response): Promise<void> {
    const hoyTexto = hoyEnSantiago(this.reloj);
    const hoy = aFechaBd(hoyTexto);
    const donde = condicionesDeRegistros(filtros, hoy);
    // Antes de escribir nada: si el resultado no cabe, se responde un 400 normal y no un archivo a medias.
    const total = await this.prisma.registro.count({ where: donde });
    if (total > this.maximoFilas) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Hay ${total.toLocaleString('es-CL')} registros con estos filtros y el máximo por archivo es ${this.maximoFilas.toLocaleString('es-CL')}. Acota los filtros (año, sector, carrera o estado) y vuelve a exportar.`,
      });
    }

    respuesta.setHeader('Content-Type', TIPO_XLSX);
    respuesta.setHeader('Content-Disposition', `attachment; filename="registros-${filtros.anio === undefined ? 'todos' : String(filtros.anio)}.xlsx"`);
    respuesta.setHeader('Cache-Control', 'private, no-store');
    try {
      const libro = new stream.xlsx.WorkbookWriter({ stream: respuesta, useStyles: true, useSharedStrings: false });
      const hoja = libro.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 1 }] });
      hoja.columns = COLUMNAS.map((c) => ({ width: c.ancho }));
      const encabezado = hoja.addRow(COLUMNAS.map((c) => c.titulo));
      encabezado.font = { bold: true };
      encabezado.commit();

      for (let desde = 0; desde < total; desde += TAMANO_LOTE) {
        const filas = await this.prisma.registro.findMany({
          where: donde,
          orderBy: ORDEN_DE_REGISTROS,
          skip: desde,
          take: TAMANO_LOTE,
          select: {
            correlativo: true, nivelImpacto: true, recurso: true, descripcion: true, estado: true, fechaComprometida: true, fechaEfectiva: true,
            comentarioCierre: true, motivoAnulacion: true, creadoEn: true,
            sesion: { select: { fecha: true, instancia: true, canal: { select: { nombre: true } }, creador: { select: { nombre: true } } } },
            carrera: { select: { nombre: true, sector: { select: { nombre: true } } } },
            asignatura: { select: { nombre: true } },
            versionMalla: { select: { anio: true } },
          },
        });
        for (const r of filas) {
          const fechaSesion = deFechaBd(r.sesion.fecha);
          // Solo textos y números: un valor que empiece por = + - o @ queda como texto, nunca como fórmula.
          hoja
            .addRow([
              r.correlativo,
              Number(fechaSesion.slice(0, 4)),
              ddmmaaaa(fechaSesion),
              r.sesion.instancia,
              r.sesion.canal.nombre,
              r.carrera.sector.nombre,
              r.carrera.nombre,
              NIVELES[r.nivelImpacto],
              textoDelObjeto({ nivelImpacto: r.nivelImpacto, carrera: r.carrera.nombre, asignatura: r.asignatura?.nombre, anioMalla: r.versionMalla?.anio, recurso: r.recurso }),
              r.recurso ?? '',
              r.descripcion,
              ddmmaaaa(deFechaBd(r.fechaComprometida)),
              ESTADOS[r.estado],
              r.estado === 'ABIERTO' && r.fechaComprometida < hoy ? 'Sí' : 'No',
              r.fechaEfectiva === null ? '' : ddmmaaaa(deFechaBd(r.fechaEfectiva)),
              r.comentarioCierre ?? '',
              r.motivoAnulacion ?? '',
              r.sesion.creador.nombre,
              marcaEnSantiago(r.creadoEn),
            ])
            .commit();
        }
      }
      hoja.commit();
      await libro.commit();
    } catch {
      // Con las cabeceras ya enviadas no se puede responder un error: se corta la conexión, sin detalle en el log (puede traer datos).
      this.registro.error('La exportación de registros se interrumpió');
      respuesta.destroy();
    }
  }
}
