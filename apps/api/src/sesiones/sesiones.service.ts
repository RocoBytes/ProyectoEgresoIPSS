import { rm } from 'node:fs/promises';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ErrorValidacion, NivelImpacto, RegistroCreado, RespuestaSesionCreada } from '@ipss/shared';
import { AlcanceService } from '../acceso/alcance.service';
import type { UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { aplanarErrores, MENSAJE_DATOS_INVALIDOS } from '../comun/errores-validacion';
import { aFechaBd, deFechaBd, hoyEnSantiago } from '../comun/fecha-texto';
import { textoDelObjeto } from '../comun/objeto-registro';
import { RELOJ, type Reloj } from '../comun/reloj';
import { ALMACENAMIENTO_EVIDENCIAS, type AlmacenamientoEvidencias } from '../evidencias/almacenamiento';
import { type ArchivoValidado, ValidadorArchivos } from '../evidencias/validador-archivos';
import { PrismaService } from '../prisma/prisma.service';
import { DatosSesionDto, type RegistroDto } from './dto/datos-sesion.dto';

export interface ArchivosSubidos {
  acta?: Express.Multer.File[];
  fotos?: Express.Multer.File[];
}

const MENSAJE_CANAL = 'Selecciona el canal por el que llegó la retroalimentación.';

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

const recortar = (valor: unknown): unknown => (typeof valor === 'string' ? valor.trim() : valor);

/** Recorta los textos y descarta renglones vacíos antes de validar: «   » no cuenta como participante ni como descripción. */
function normalizar(crudo: unknown): unknown {
  if (!esObjeto(crudo)) return crudo;
  return {
    ...crudo,
    instancia: recortar(crudo['instancia']),
    participantes: Array.isArray(crudo['participantes']) ? crudo['participantes'].map(recortar).filter((p) => p !== '') : crudo['participantes'],
    registros: Array.isArray(crudo['registros'])
      ? crudo['registros'].map((r: unknown) => (esObjeto(r) ? { ...r, descripcion: recortar(r['descripcion']), recurso: recortar(r['recurso']) } : r))
      : crudo['registros'],
  };
}

function claveDuplicado(r: RegistroDto): string {
  const objeto = r.nivelImpacto === 'MALLA' ? r.versionMallaId : r.nivelImpacto === 'PERFIL_INGRESO' || r.nivelImpacto === 'PERFIL_EGRESO' ? '' : r.asignaturaId;
  const recurso = r.nivelImpacto === 'RECURSO' ? (r.recurso ?? '').trim().toLowerCase() : '';
  return [r.carreraId, r.nivelImpacto, objeto ?? '', recurso].join('|');
}

@Injectable()
export class SesionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alcance: AlcanceService,
    private readonly validador: ValidadorArchivos,
    @Inject(ALMACENAMIENTO_EVIDENCIAS) private readonly almacenamiento: AlmacenamientoEvidencias,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async crear(usuario: UsuarioAutenticado, datosJson: string | undefined, archivos: ArchivosSubidos): Promise<RespuestaSesionCreada> {
    const temporales = [...(archivos.acta ?? []), ...(archivos.fotos ?? [])].map((a) => a.path);
    const incorporadas: string[] = [];
    try {
      const datos = await this.validarDatos(datosJson, archivos);
      await this.verificarCanal(datos.canalId);
      const carreras = await this.verificarAlcance(usuario, datos);
      const objetos = await this.verificarObjetos(datos, carreras);

      const acta = await this.validarArchivo(archivos.acta?.[0], 'acta');
      const fotos: Array<{ archivo: Express.Multer.File; validado: ArchivoValidado }> = [];
      const erroresFotos: ErrorValidacion[] = [];
      for (const [i, foto] of (archivos.fotos ?? []).entries()) {
        const resultado = await this.validador.validarFoto(foto);
        if (typeof resultado === 'string') erroresFotos.push({ campo: `fotos.${i}`, mensaje: resultado });
        else fotos.push({ archivo: foto, validado: resultado });
      }
      if (typeof acta === 'object' && 'campo' in acta) erroresFotos.unshift(acta);
      if (erroresFotos.length > 0) throw this.error400(erroresFotos);
      if (!('sha256' in acta)) throw new Error('Acta sin validar');

      const rutaActa = await this.almacenamiento.incorporar(archivos.acta?.[0]?.path ?? '');
      incorporadas.push(rutaActa);
      const rutasFotos: string[] = [];
      for (const { archivo } of fotos) {
        const ruta = await this.almacenamiento.incorporar(archivo.path);
        incorporadas.push(ruta);
        rutasFotos.push(ruta);
      }

      return await this.guardar(usuario, datos, { acta, rutaActa, fotos: fotos.map((f) => f.validado), rutasFotos }, carreras, objetos);
    } catch (error) {
      // Si algo falló después de mover archivos a su lugar definitivo, no pueden quedar huérfanos.
      await Promise.all(incorporadas.map((ruta) => this.almacenamiento.borrar(ruta).catch(() => undefined)));
      throw error;
    } finally {
      // Lo que no se incorporó (error de validación) sigue en `.entrantes` y se borra; lo incorporado ya no existe ahí.
      await Promise.all(temporales.map((ruta) => rm(ruta, { force: true })));
    }
  }

  private async validarArchivo(archivo: Express.Multer.File | undefined, campo: string): Promise<ArchivoValidado | ErrorValidacion> {
    if (archivo === undefined) return { campo, mensaje: 'Adjunta el acta en PDF: es la evidencia de origen de la sesión.' };
    const resultado = await this.validador.validarActa(archivo);
    return typeof resultado === 'string' ? { campo, mensaje: resultado } : resultado;
  }

  private error400(errores: ErrorValidacion[]): BadRequestException {
    const vistos = new Set<string>();
    const unicos = errores.filter((e) => !vistos.has(e.campo) && vistos.add(e.campo));
    return new BadRequestException({ statusCode: 400, message: MENSAJE_DATOS_INVALIDOS, errores: unicos });
  }

  private async validarDatos(datosJson: string | undefined, archivos: ArchivosSubidos): Promise<DatosSesionDto> {
    const errores: ErrorValidacion[] = [];
    if ((archivos.acta?.length ?? 0) === 0) errores.push({ campo: 'acta', mensaje: 'Adjunta el acta en PDF: es la evidencia de origen de la sesión.' });
    let crudo: unknown;
    try {
      crudo = JSON.parse(datosJson ?? '');
    } catch {
      throw this.error400([...errores, { campo: 'datos', mensaje: 'Los datos de la sesión no se pudieron leer.' }]);
    }
    const datos = plainToInstance(DatosSesionDto, normalizar(crudo));
    errores.push(...aplanarErrores(await validate(datos, { whitelist: true, forbidNonWhitelisted: true })));
    this.reglasCruzadas(datos, errores);
    if (errores.length > 0) throw this.error400(errores);
    return datos;
  }

  /** Reglas que comparan campos entre sí; solo se evalúan cuando los campos que comparan son válidos. */
  private reglasCruzadas(datos: DatosSesionDto, errores: ErrorValidacion[]): void {
    const malos = new Set(errores.map((e) => e.campo));
    const fechaValida = !malos.has('fecha') && typeof datos.fecha === 'string';
    if (fechaValida && datos.fecha > hoyEnSantiago(this.reloj)) errores.push({ campo: 'fecha', mensaje: 'La fecha de la sesión no puede ser posterior a hoy.' });
    if (!Array.isArray(datos.registros)) return;
    const vistos = new Set<string>();
    datos.registros.forEach((r, i) => {
      if (fechaValida && !malos.has(`registros.${i}.fechaComprometida`) && r.fechaComprometida < datos.fecha) {
        errores.push({ campo: `registros.${i}.fechaComprometida`, mensaje: 'La fecha comprometida no puede ser anterior a la sesión.' });
      }
      if ([...malos].some((c) => c.startsWith(`registros.${i}.`))) return;
      const clave = claveDuplicado(r);
      if (vistos.has(clave)) errores.push({ campo: `registros.${i}.nivelImpacto`, mensaje: 'Ya hay otro registro igual en esta sesión.' });
      vistos.add(clave);
    });
  }

  private async verificarCanal(canalId: string): Promise<void> {
    const canal = await this.prisma.canal.findUnique({ where: { id: canalId }, select: { activo: true } });
    if (canal?.activo !== true) throw this.error400([{ campo: 'canalId', mensaje: MENSAJE_CANAL }]);
  }

  private async verificarAlcance(usuario: UsuarioAutenticado, datos: DatosSesionDto): Promise<Map<string, string>> {
    const ids = [...new Set(datos.registros.map((r) => r.carreraId))];
    const filas = await this.prisma.carrera.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } });
    const carreras = new Map(filas.map((c) => [c.id, c.nombre]));
    const desconocidas = datos.registros.flatMap((r, i) => (carreras.has(r.carreraId) ? [] : [{ campo: `registros.${i}.carreraId`, mensaje: 'Selecciona la carrera.' }]));
    if (desconocidas.length > 0) throw this.error400(desconocidas);
    for (const [id, nombre] of carreras) {
      if (!(await this.alcance.puedeModificarCarrera(usuario, id))) throw new ForbiddenException(`No puedes crear registros para ${nombre}: está fuera de tu alcance.`);
    }
    return carreras;
  }

  /** La base también lo exige (trigger); aquí se valida antes para responder con el campo exacto y no con un 409. */
  private async verificarObjetos(datos: DatosSesionDto, carreras: Map<string, string>): Promise<Map<string, { nombre?: string; anio?: number }>> {
    const idsAsig = datos.registros.flatMap((r) => (r.asignaturaId !== undefined && usaAsignatura(r.nivelImpacto) ? [r.asignaturaId] : []));
    const idsMalla = datos.registros.flatMap((r) => (r.versionMallaId !== undefined && r.nivelImpacto === 'MALLA' ? [r.versionMallaId] : []));
    const [asignaturas, mallas] = await Promise.all([
      this.prisma.asignatura.findMany({ where: { id: { in: idsAsig } }, select: { id: true, carreraId: true, tipo: true, nombre: true } }),
      this.prisma.versionMalla.findMany({ where: { id: { in: idsMalla } }, select: { id: true, carreraId: true, anio: true } }),
    ]);
    const objetos = new Map<string, { nombre?: string; anio?: number }>();
    const errores: ErrorValidacion[] = [];
    datos.registros.forEach((r, i) => {
      if (usaAsignatura(r.nivelImpacto)) {
        const a = asignaturas.find((x) => x.id === r.asignaturaId);
        const tipoOk = a?.tipo === (r.nivelImpacto === 'MODULO' ? 'MODULO' : 'ASIGNATURA');
        if (a === undefined || a.carreraId !== r.carreraId || !tipoOk) {
          errores.push({ campo: `registros.${i}.asignaturaId`, mensaje: r.nivelImpacto === 'MODULO' ? 'Selecciona el módulo.' : 'Selecciona la asignatura.' });
        } else objetos.set(`${i}`, { nombre: a.nombre });
      } else if (r.nivelImpacto === 'MALLA') {
        const m = mallas.find((x) => x.id === r.versionMallaId);
        if (m === undefined || m.carreraId !== r.carreraId) errores.push({ campo: `registros.${i}.versionMallaId`, mensaje: 'Selecciona la versión de malla.' });
        else objetos.set(`${i}`, { anio: m.anio });
      }
    });
    void carreras;
    if (errores.length > 0) throw this.error400(errores);
    return objetos;
  }

  private guardar(
    usuario: UsuarioAutenticado,
    datos: DatosSesionDto,
    evidencias: { acta: ArchivoValidado; rutaActa: string; fotos: ArchivoValidado[]; rutasFotos: string[] },
    carreras: Map<string, string>,
    objetos: Map<string, { nombre?: string; anio?: number }>,
  ): Promise<RespuestaSesionCreada> {
    return this.prisma.$transaction(async (tx) => {
      const sesion = await tx.sesion.create({
        data: { canalId: datos.canalId, fecha: aFechaBd(datos.fecha), instancia: datos.instancia, participantes: datos.participantes, creadoPor: usuario.id },
        select: { id: true },
      });
      const subidas = [{ v: evidencias.acta, ruta: evidencias.rutaActa }, ...evidencias.fotos.map((v, i) => ({ v, ruta: evidencias.rutasFotos[i] ?? '' }))];
      for (const { v, ruta } of subidas) {
        await tx.evidencia.create({
          data: { sesionId: sesion.id, nombreOriginal: v.nombreOriginal, mime: v.mime, tamano: v.tamano, sha256: v.sha256, ruta, subidoPor: usuario.id },
        });
      }
      const creados: RegistroCreado[] = [];
      for (const [i, r] of datos.registros.entries()) {
        const objeto = objetos.get(`${i}`);
        const fila = await tx.registro.create({
          data: {
            sesionId: sesion.id,
            carreraId: r.carreraId,
            nivelImpacto: r.nivelImpacto,
            // El CHECK de la base exige que los campos que el nivel no usa queden nulos.
            asignaturaId: usaAsignatura(r.nivelImpacto) ? r.asignaturaId : null,
            versionMallaId: r.nivelImpacto === 'MALLA' ? r.versionMallaId : null,
            recurso: r.nivelImpacto === 'RECURSO' ? r.recurso : null,
            descripcion: r.descripcion,
            fechaComprometida: aFechaBd(r.fechaComprometida),
            actualizadoPor: usuario.id,
          },
          select: { id: true, correlativo: true },
        });
        const carrera = carreras.get(r.carreraId) ?? '';
        creados.push({
          id: fila.id,
          correlativo: fila.correlativo,
          carrera: { id: r.carreraId, nombre: carrera },
          nivelImpacto: r.nivelImpacto,
          objeto: textoDelObjeto({ nivelImpacto: r.nivelImpacto, carrera, asignatura: objeto?.nombre, anioMalla: objeto?.anio, recurso: r.recurso }),
          fechaComprometida: deFechaBd(aFechaBd(r.fechaComprometida)),
        });
      }
      return { sesionId: sesion.id, fecha: datos.fecha, instancia: datos.instancia, registros: creados };
    });
  }
}

function usaAsignatura(nivel: NivelImpacto): boolean {
  return nivel === 'RECURSO' || nivel === 'ASIGNATURA' || nivel === 'MODULO';
}
