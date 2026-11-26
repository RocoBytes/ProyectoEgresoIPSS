import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DetalleRegistro, EdicionRegistro, EntradaHistorial, EvidenciaResumen, FilaRegistro, RespuestaAnios, RespuestaEdicion, RespuestaListadoRegistros } from '@ipss/shared';
import { AlcanceService } from '../acceso/alcance.service';
import type { UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { aFechaBd, deFechaBd, hoyEnSantiago } from '../comun/fecha-texto';
import { textoDelObjeto } from '../comun/objeto-registro';
import { RELOJ, type Reloj } from '../comun/reloj';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListarRegistrosDto } from './dto/listar-registros.dto';

export const POR_PAGINA = 10;

// Prisma no escapa los comodines de LIKE: sin esto, buscar «%» o «_» devolvería todo.
const escaparComodines = (texto: string): string => texto.replace(/[\\%_]/g, '\\$&');

const camel = (columna: string): string => columna.replace(/_([a-z])/g, (_m, l: string) => l.toUpperCase());

const resumen = (e: { id: string; nombreOriginal: string; mime: string; tamano: number; sha256: string }): EvidenciaResumen => ({
  id: e.id,
  nombreOriginal: e.nombreOriginal,
  mime: e.mime,
  tamano: e.tamano,
  sha256: e.sha256,
});

@Injectable()
export class RegistrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async listar(filtros: ListarRegistrosDto): Promise<RespuestaListadoRegistros> {
    const hoy = aFechaBd(hoyEnSantiago(this.reloj));
    const pagina = filtros.pagina ?? 1;
    const donde = this.condiciones(filtros, hoy);
    const [total, filas] = await Promise.all([
      this.prisma.registro.count({ where: donde }),
      this.prisma.registro.findMany({
        where: donde,
        orderBy: [{ sesion: { fecha: 'desc' } }, { anio: 'desc' }, { numero: 'desc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true, correlativo: true, nivelImpacto: true, recurso: true, estado: true, fechaComprometida: true,
          sesion: { select: { id: true, fecha: true, canal: { select: { nombre: true } } } },
          carrera: { select: { id: true, nombre: true } },
          asignatura: { select: { nombre: true } },
          versionMalla: { select: { anio: true } },
        },
      }),
    ]);
    const resultado: FilaRegistro[] = filas.map((f) => ({
      id: f.id,
      correlativo: f.correlativo,
      sesion: { id: f.sesion.id, fecha: deFechaBd(f.sesion.fecha) },
      carrera: f.carrera,
      nivelImpacto: f.nivelImpacto,
      objeto: textoDelObjeto({ nivelImpacto: f.nivelImpacto, carrera: f.carrera.nombre, asignatura: f.asignatura?.nombre, anioMalla: f.versionMalla?.anio, recurso: f.recurso }),
      canal: f.sesion.canal.nombre,
      fechaComprometida: deFechaBd(f.fechaComprometida),
      estado: f.estado,
      vencido: f.estado === 'ABIERTO' && f.fechaComprometida < hoy,
    }));
    return { filas: resultado, total, pagina, porPagina: POR_PAGINA };
  }

  private condiciones(f: ListarRegistrosDto, hoy: Date): Prisma.RegistroWhereInput {
    const donde: Prisma.RegistroWhereInput = {};
    const y: Prisma.RegistroWhereInput[] = [];
    // El año del filtro es el de la fecha de la SESIÓN, no el del correlativo.
    if (f.anio !== undefined) y.push({ sesion: { fecha: { gte: aFechaBd(`${String(f.anio).padStart(4, '0')}-01-01`), lte: aFechaBd(`${String(f.anio).padStart(4, '0')}-12-31`) } } });
    if (f.sectorId !== undefined) y.push({ carrera: { sectorId: f.sectorId } });
    if (f.carreraId !== undefined) donde.carreraId = f.carreraId;
    if (f.asignaturaId !== undefined) donde.asignaturaId = f.asignaturaId;
    if (f.canalId !== undefined) y.push({ sesion: { canalId: f.canalId } });
    if (f.nivel !== undefined) donde.nivelImpacto = f.nivel;
    if (f.estado === 'VENCIDO') {
      donde.estado = 'ABIERTO';
      donde.fechaComprometida = { lt: hoy };
    } else if (f.estado !== undefined) donde.estado = f.estado;
    if (f.q !== undefined && f.q.trim() !== '') {
      const q = escaparComodines(f.q.trim());
      const contiene = { contains: q, mode: 'insensitive' as const };
      y.push({
        OR: [
          { correlativo: contiene },
          { descripcion: contiene },
          { recurso: contiene },
          { asignatura: { nombre: contiene } },
          { carrera: { nombre: contiene } },
          { sesion: { instancia: contiene } },
        ],
      });
    }
    if (y.length > 0) donde.AND = y;
    return donde;
  }

  async anios(): Promise<RespuestaAnios> {
    const fechas = await this.prisma.sesion.findMany({ where: { registros: { some: {} } }, select: { fecha: true } });
    return [...new Set(fechas.map((s) => Number(deFechaBd(s.fecha).slice(0, 4))))].sort((a, b) => b - a);
  }

  async detalle(usuario: UsuarioAutenticado, id: string): Promise<DetalleRegistro> {
    const r = await this.prisma.registro.findUnique({
      where: { id },
      include: {
        carrera: { include: { sector: true } },
        asignatura: true,
        versionMalla: true,
        evidenciaCierre: true,
        sesion: {
          include: {
            canal: true,
            creador: { select: { nombre: true } },
            evidencias: { orderBy: { creadoEn: 'asc' } },
            registros: { where: { id: { not: id } }, include: { carrera: true, asignatura: true, versionMalla: true }, orderBy: [{ anio: 'asc' }, { numero: 'asc' }] },
          },
        },
        historialEstados: { include: { usuario: { select: { nombre: true } } } },
        historialCambios: { include: { usuario: { select: { nombre: true } } } },
      },
    });
    if (r === null) throw new NotFoundException('No encontramos ese registro');
    const hoy = aFechaBd(hoyEnSantiago(this.reloj));
    const objeto = (x: typeof r): string => textoDelObjeto({ nivelImpacto: x.nivelImpacto, carrera: x.carrera.nombre, asignatura: x.asignatura?.nombre, anioMalla: x.versionMalla?.anio, recurso: x.recurso });

    const tiposEstado = { ABIERTO: 'CREACION', CERRADO: 'CIERRE', ANULADO: 'ANULACION' } as const;
    const estados: EntradaHistorial[] = r.historialEstados.map((h) => ({ tipo: tiposEstado[h.estadoNuevo], fecha: h.creadoEn.toISOString(), usuario: h.usuario.nombre }));
    // Un cierre o una anulación también deja un historial_cambio (fecha efectiva, evidencia...) con la misma marca de tiempo: no es una edición.
    const marcasDeEstado = new Set(r.historialEstados.map((h) => h.creadoEn.getTime()));
    const ediciones: EntradaHistorial[] = r.historialCambios
      .filter((h) => !marcasDeEstado.has(h.creadoEn.getTime()))
      .map((h) => ({
        tipo: 'EDICION' as const,
        fecha: h.creadoEn.toISOString(),
        usuario: h.usuario.nombre,
        cambios: Object.fromEntries(Object.entries(h.cambios as Record<string, { antes: unknown; despues: unknown }>).map(([k, v]) => [camel(k), v])),
      }));
    const historial = [...estados, ...ediciones].sort((a, b) => b.fecha.localeCompare(a.fecha));

    const evidencias = r.sesion.evidencias;
    const acta = evidencias.find((e) => e.mime === 'application/pdf');
    const modificable = r.estado === 'ABIERTO' && (await this.alcance.puedeModificarCarrera(usuario, r.carreraId));
    let motivoConsulta: string | undefined;
    if (r.estado === 'ABIERTO' && !modificable) {
      motivoConsulta = await this.motivoDeConsulta(usuario, r.carrera.nombre);
    }
    return {
      id: r.id,
      correlativo: r.correlativo,
      estado: r.estado,
      vencido: r.estado === 'ABIERTO' && r.fechaComprometida < hoy,
      sector: { id: r.carrera.sector.id, nombre: r.carrera.sector.nombre },
      carrera: { id: r.carrera.id, nombre: r.carrera.nombre },
      nivelImpacto: r.nivelImpacto,
      objeto: objeto(r),
      recurso: r.recurso,
      descripcion: r.descripcion,
      fechaComprometida: deFechaBd(r.fechaComprometida),
      fechaEfectiva: r.fechaEfectiva === null ? null : deFechaBd(r.fechaEfectiva),
      comentarioCierre: r.comentarioCierre,
      motivoAnulacion: r.motivoAnulacion,
      evidenciaCierre: r.evidenciaCierre === null ? null : resumen(r.evidenciaCierre),
      creadoEn: r.creadoEn.toISOString(),
      sesion: {
        id: r.sesion.id,
        canal: r.sesion.canal.nombre,
        fecha: deFechaBd(r.sesion.fecha),
        instancia: r.sesion.instancia,
        participantes: r.sesion.participantes,
        creadoPor: r.sesion.creador.nombre,
        evidencias: { acta: acta === undefined ? null : resumen(acta), fotos: evidencias.filter((e) => e.mime.startsWith('image/')).map(resumen) },
      },
      historial,
      otrosRegistros: r.sesion.registros.map((o) => ({ id: o.id, correlativo: o.correlativo, carrera: o.carrera.nombre, nivelImpacto: o.nivelImpacto, objeto: objeto(o as unknown as typeof r) })),
      permisos: modificable || motivoConsulta === undefined ? { puedeModificar: modificable } : { puedeModificar: false, motivoConsulta },
    };
  }

  private async motivoDeConsulta(usuario: UsuarioAutenticado, carrera: string): Promise<string> {
    if (usuario.rol === 'ASEGURAMIENTO_CALIDAD') return 'Tu perfil es de consulta: puedes revisar y descargar este registro, pero no modificar.';
    const { descripcion } = await this.alcance.alcanceDe(usuario);
    return `${carrera} está fuera de tu alcance (${descripcion}). Puedes consultar este registro, pero no modificar.`;
  }

  async editar(usuario: UsuarioAutenticado, id: string, cambios: EdicionRegistro): Promise<RespuestaEdicion> {
    const actual = await this.prisma.registro.findUnique({
      where: { id },
      select: { descripcion: true, fechaComprometida: true, carreraId: true, carrera: { select: { nombre: true } }, sesion: { select: { fecha: true } } },
    });
    if (actual === null) throw new NotFoundException('No encontramos ese registro');
    if (!(await this.alcance.puedeModificarCarrera(usuario, actual.carreraId))) {
      throw new ForbiddenException(await this.motivoDeConsulta(usuario, actual.carrera.nombre));
    }
    if (cambios.fechaComprometida !== undefined && cambios.fechaComprometida < deFechaBd(actual.sesion.fecha)) {
      throw new BadRequestException({ statusCode: 400, message: 'La solicitud tiene datos inválidos', errores: [{ campo: 'fechaComprometida', mensaje: 'No puede ser anterior a la sesión.' }] });
    }
    const data: Prisma.RegistroUpdateInput = {};
    if (cambios.descripcion !== undefined && cambios.descripcion !== actual.descripcion) data.descripcion = cambios.descripcion;
    if (cambios.fechaComprometida !== undefined && cambios.fechaComprometida !== deFechaBd(actual.fechaComprometida)) data.fechaComprometida = aFechaBd(cambios.fechaComprometida);
    if (Object.keys(data).length === 0) return { sinCambios: true };
    // Un registro cerrado o anulado lo rechaza el trigger de la base y el filtro global lo traduce a 409.
    await this.prisma.registro.update({ where: { id }, data: { ...data, actualizador: { connect: { id: usuario.id } } } });
    return { sinCambios: false };
  }
}
