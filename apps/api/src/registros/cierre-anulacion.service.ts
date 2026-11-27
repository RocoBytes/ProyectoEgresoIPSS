import { rm } from 'node:fs/promises';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ErrorValidacion, RespuestaCambioEstado } from '@ipss/shared';
import { AlcanceService } from '../acceso/alcance.service';
import type { UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { aplanarErrores, MENSAJE_DATOS_INVALIDOS } from '../comun/errores-validacion';
import { aFechaBd, deFechaBd, hoyEnSantiago } from '../comun/fecha-texto';
import { RELOJ, type Reloj } from '../comun/reloj';
import { ALMACENAMIENTO_EVIDENCIAS, type AlmacenamientoEvidencias } from '../evidencias/almacenamiento';
import { ValidadorArchivos } from '../evidencias/validador-archivos';
import { PrismaService } from '../prisma/prisma.service';
import { CerrarRegistroDto } from './dto/cerrar-registro.dto';
import { RegistrosService } from './registros.service';

const MENSAJE_SIN_EVIDENCIA = 'Adjunta la evidencia. Sin ella el registro no se puede cerrar.';
const ESTADO_EN_TEXTO = { ABIERTO: 'abierto', CERRADO: 'cerrado', ANULADO: 'anulado' } as const;

const ddmmaaaa = (fecha: string): string => fecha.split('-').reverse().join('-');

/** Cierre y anulación de un registro: las dos transiciones que dejan de admitir modificaciones. */
@Injectable()
export class CierreAnulacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly registros: RegistrosService,
    private readonly validador: ValidadorArchivos,
    @Inject(ALMACENAMIENTO_EVIDENCIAS) private readonly almacenamiento: AlmacenamientoEvidencias,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async cerrar(usuario: UsuarioAutenticado, id: string, datosJson: string | undefined, archivo: Express.Multer.File | undefined): Promise<RespuestaCambioEstado> {
    let incorporada: string | undefined;
    try {
      const registro = await this.cargarAbierto(usuario, id);
      const errores: ErrorValidacion[] = [];

      let crudo: unknown;
      try {
        crudo = JSON.parse(datosJson ?? '');
      } catch {
        crudo = undefined;
      }
      const datos = plainToInstance(CerrarRegistroDto, typeof crudo === 'object' && crudo !== null && !Array.isArray(crudo) ? crudo : {});
      errores.push(...aplanarErrores(await validate(datos, { whitelist: true, forbidNonWhitelisted: true })));
      if (!errores.some((e) => e.campo === 'fechaEfectiva')) {
        if (datos.fechaEfectiva > hoyEnSantiago(this.reloj)) errores.push({ campo: 'fechaEfectiva', mensaje: 'La fecha efectiva no puede ser posterior a hoy.' });
        else if (datos.fechaEfectiva < deFechaBd(registro.sesion.fecha)) {
          errores.push({ campo: 'fechaEfectiva', mensaje: `La fecha efectiva no puede ser anterior a la sesión (${ddmmaaaa(deFechaBd(registro.sesion.fecha))}).` });
        }
      }

      const validada = archivo === undefined ? undefined : await this.validador.validarEvidenciaCierre(archivo);
      if (archivo === undefined) errores.push({ campo: 'evidencia', mensaje: MENSAJE_SIN_EVIDENCIA });
      else if (typeof validada === 'string') errores.push({ campo: 'evidencia', mensaje: validada });
      if (errores.length > 0) throw new BadRequestException({ statusCode: 400, message: MENSAJE_DATOS_INVALIDOS, errores });
      if (archivo === undefined || validada === undefined || typeof validada === 'string') throw new Error('Cierre sin evidencia validada');

      const ruta = await this.almacenamiento.incorporar(archivo.path);
      incorporada = ruta;
      const comentario = datos.comentario === undefined || datos.comentario === '' ? null : datos.comentario;
      return await this.prisma.$transaction(async (tx) => {
        // Evidencia de cierre: no pertenece a una sesión (sesion_id nulo).
        const evidencia = await tx.evidencia.create({
          data: { nombreOriginal: validada.nombreOriginal, mime: validada.mime, tamano: validada.tamano, sha256: validada.sha256, ruta, subidoPor: usuario.id },
          select: { id: true },
        });
        // Se actualiza por id, no por id+estado: quien pierde una carrera choca con el trigger (409) y no con un 404 engañoso.
        const fila = await tx.registro.update({
          where: { id },
          data: { estado: 'CERRADO', fechaEfectiva: aFechaBd(datos.fechaEfectiva), evidenciaCierreId: evidencia.id, comentarioCierre: comentario, actualizadoPor: usuario.id },
          select: { id: true, correlativo: true, estado: true },
        });
        return fila;
      });
    } catch (error) {
      // Si algo falló después de mover el archivo a su lugar definitivo, no puede quedar huérfano.
      if (incorporada !== undefined) await this.almacenamiento.borrar(incorporada).catch(() => undefined);
      throw error;
    } finally {
      // Un fallo al limpiar el temporal no debe reemplazar la respuesta original (200, 400, 403 o 409).
      if (archivo !== undefined) await rm(archivo.path, { force: true }).catch(() => undefined);
    }
  }

  async anular(usuario: UsuarioAutenticado, id: string, motivo: string): Promise<RespuestaCambioEstado> {
    await this.cargarAbierto(usuario, id);
    return this.prisma.registro.update({
      where: { id },
      data: { estado: 'ANULADO', motivoAnulacion: motivo, actualizadoPor: usuario.id },
      select: { id: true, correlativo: true, estado: true },
    });
  }

  /** 404, 403 y 409 en ese orden; la base sigue siendo la autoridad final ante una carrera. */
  private async cargarAbierto(usuario: UsuarioAutenticado, id: string) {
    const registro = await this.prisma.registro.findUnique({
      where: { id },
      select: { correlativo: true, estado: true, carreraId: true, carrera: { select: { nombre: true } }, sesion: { select: { fecha: true } } },
    });
    if (registro === null) throw new NotFoundException('No encontramos ese registro');
    if (!(await this.alcance.puedeModificarCarrera(usuario, registro.carreraId))) {
      throw new ForbiddenException(await this.registros.motivoDeConsulta(usuario, registro.carrera.nombre));
    }
    if (registro.estado !== 'ABIERTO') {
      throw new ConflictException(`El registro ${registro.correlativo} ya está ${ESTADO_EN_TEXTO[registro.estado]} y no admite modificaciones.`);
    }
    return registro;
  }
}
