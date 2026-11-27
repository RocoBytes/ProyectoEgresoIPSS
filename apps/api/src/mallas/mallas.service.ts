import { rm } from 'node:fs/promises';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import type { ErrorValidacion, RespuestaMallas, VersionMallaListada } from '@ipss/shared';
import { AlcanceService } from '../acceso/alcance.service';
import type { UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { aplanarErrores, MENSAJE_DATOS_INVALIDOS } from '../comun/errores-validacion';
import { aFechaBd, deFechaBd, hoyEnSantiago } from '../comun/fecha-texto';
import { RELOJ, type Reloj } from '../comun/reloj';
import { ALMACENAMIENTO_EVIDENCIAS, type AlmacenamientoEvidencias } from '../evidencias/almacenamiento';
import { ValidadorArchivos } from '../evidencias/validador-archivos';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DatosMallaDto } from './dto/datos-malla.dto';
import { esDuplicadoDeAnioDeMalla } from './errores-malla';

const ANIO_MINIMO = 2000;
const MENSAJE_ANIO = 'Escribe el año con cuatro dígitos.';
const MENSAJE_SIN_ARCHIVO = 'Adjunta el PDF de la malla.';
const MENSAJE_CARRERA = 'No encontramos esa carrera';
const QUE_CONSULTA = 'sus mallas';
const mensajeDuplicada = (anio: number): string => `Ya existe la malla ${String(anio)} de esta carrera.`;

const SELECCION = {
  id: true,
  anio: true,
  vigenteDesde: true,
  creadoEn: true,
  archivo: { select: { id: true, nombreOriginal: true, mime: true, tamano: true, sha256: true, subidaPor: { select: { nombre: true } } } },
} satisfies Prisma.VersionMallaSelect;
type FilaMalla = Prisma.VersionMallaGetPayload<{ select: typeof SELECCION }>;

function aVersion(fila: FilaMalla, vigente: boolean): VersionMallaListada {
  const { archivo } = fila;
  return {
    id: fila.id,
    anio: fila.anio,
    vigenteDesde: deFechaBd(fila.vigenteDesde),
    vigente,
    archivo: { id: archivo.id, nombreOriginal: archivo.nombreOriginal, mime: archivo.mime, tamano: archivo.tamano, sha256: archivo.sha256 },
    subidaPor: archivo.subidaPor.nombre,
    creadaEn: fila.creadoEn.toISOString(),
  };
}

/** Versiones de malla por carrera (RF-06). El PDF es una evidencia sin sesión (ADR 0005). */
@Injectable()
export class MallasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly validador: ValidadorArchivos,
    @Inject(ALMACENAMIENTO_EVIDENCIAS) private readonly almacenamiento: AlmacenamientoEvidencias,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async listar(usuario: UsuarioAutenticado, carreraId: string): Promise<RespuestaMallas> {
    const carrera = await this.prisma.carrera.findUnique({ where: { id: carreraId }, select: { nombre: true } });
    if (carrera === null) throw new NotFoundException(MENSAJE_CARRERA);
    const filas = await this.prisma.versionMalla.findMany({ where: { carreraId }, orderBy: { anio: 'desc' }, select: SELECCION });
    // Vigente es la de año más reciente: la primera, porque el orden es descendente.
    const versiones = filas.map((f, i) => aVersion(f, i === 0));
    const puedeSubir = await this.alcance.puedeModificarCarrera(usuario, carreraId);
    return { versiones, permisos: puedeSubir ? { puedeSubir } : { puedeSubir, motivoConsulta: await this.alcance.motivoDeConsulta(usuario, carrera.nombre, QUE_CONSULTA) } };
  }

  async subir(usuario: UsuarioAutenticado, datosJson: string | undefined, archivo: Express.Multer.File | undefined): Promise<VersionMallaListada> {
    let incorporada: string | undefined;
    try {
      let crudo: unknown;
      try {
        crudo = JSON.parse(datosJson ?? '');
      } catch {
        throw this.error400([{ campo: 'datos', mensaje: 'Los datos de la malla no se pudieron leer.' }]);
      }
      const objeto = typeof crudo === 'object' && crudo !== null && !Array.isArray(crudo) ? (crudo as Record<string, unknown>) : {};
      // Un identificador ausente o mal formado es, para el usuario, una carrera que no existe.
      const carreraId = objeto['carreraId'];
      if (typeof carreraId !== 'string' || !isUUID(carreraId, 'all')) throw new NotFoundException(MENSAJE_CARRERA);
      const carrera = await this.prisma.carrera.findUnique({ where: { id: carreraId }, select: { nombre: true } });
      if (carrera === null) throw new NotFoundException(MENSAJE_CARRERA);
      if (!(await this.alcance.puedeModificarCarrera(usuario, carreraId))) {
        throw new ForbiddenException(await this.alcance.motivoDeConsulta(usuario, carrera.nombre, QUE_CONSULTA));
      }

      const datos = plainToInstance(DatosMallaDto, objeto);
      const errores = aplanarErrores(await validate(datos, { whitelist: true, forbidNonWhitelisted: true }));
      const anio = Number(datos.anio);
      if (!errores.some((e) => e.campo === 'anio')) {
        if (anio < ANIO_MINIMO || anio > Number(hoyEnSantiago(this.reloj).slice(0, 4)) + 1) errores.push({ campo: 'anio', mensaje: MENSAJE_ANIO });
        else if ((await this.prisma.versionMalla.count({ where: { carreraId, anio } })) > 0) errores.push({ campo: 'anio', mensaje: mensajeDuplicada(anio) });
      }
      const validado = archivo === undefined ? undefined : await this.validador.validarMalla(archivo);
      if (validado === undefined) errores.push({ campo: 'archivo', mensaje: MENSAJE_SIN_ARCHIVO });
      else if (typeof validado === 'string') errores.push({ campo: 'archivo', mensaje: validado });
      if (errores.length > 0) throw this.error400(errores);
      if (archivo === undefined || validado === undefined || typeof validado === 'string') throw new Error('Malla sin archivo validado');

      const ruta = await this.almacenamiento.incorporar(archivo.path);
      incorporada = ruta;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const evidencia = await tx.evidencia.create({
            data: { nombreOriginal: validado.nombreOriginal, mime: validado.mime, tamano: validado.tamano, sha256: validado.sha256, ruta, subidoPor: usuario.id },
            select: { id: true },
          });
          const fila = await tx.versionMalla.create({ data: { carreraId, anio, vigenteDesde: aFechaBd(datos.vigenteDesde), archivoId: evidencia.id }, select: SELECCION });
          const mayor = await tx.versionMalla.aggregate({ where: { carreraId }, _max: { anio: true } });
          return aVersion(fila, fila.anio === mayor._max.anio);
        });
      } catch (error) {
        // Dos subidas simultáneas del mismo año: pierde la segunda, con el mismo mensaje que la comprobación previa.
        if (esDuplicadoDeAnioDeMalla(error)) throw this.error400([{ campo: 'anio', mensaje: mensajeDuplicada(anio) }]);
        throw error;
      }
    } catch (error) {
      // Si algo falló después de mover el archivo a su lugar definitivo, no puede quedar huérfano.
      if (incorporada !== undefined) await this.almacenamiento.borrar(incorporada).catch(() => undefined);
      throw error;
    } finally {
      if (archivo !== undefined) await rm(archivo.path, { force: true }).catch(() => undefined);
    }
  }

  private error400(errores: ErrorValidacion[]): BadRequestException {
    return new BadRequestException({ statusCode: 400, message: MENSAJE_DATOS_INVALIDOS, errores });
  }
}
