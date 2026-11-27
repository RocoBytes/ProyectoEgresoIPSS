import { randomBytes } from 'node:crypto';
import type { ContrasenasService } from '../acceso/contrasenas.service';
import type { PrismaClient } from '../generated/prisma/client';
import { ErrorDeUso } from './errores-cli';

export const ROLES = ['DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA', 'ASEGURAMIENTO_CALIDAD'] as const;
export type RolUsuario = (typeof ROLES)[number];

/** Error de uso o de datos que se muestra tal cual al operador (código de salida 1). */
export class ErrorUsuarios extends ErrorDeUso {}

export interface DatosUsuarioNuevo {
  correo: string;
  nombre: string;
  rol: string;
  sectores: readonly string[];
  carreras: readonly string[];
}

export interface ResumenUsuario {
  correo: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  /** Nombres de sectores o de carreras; vacío para Calidad. */
  alcance: string[];
}

const normalizar = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
// Lo mínimo para descartar errores de tipeo; el CHECK de la base solo exige minúsculas y sin espacios en los bordes.
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LARGO_CLAVE_BYTES = 18; // 24 caracteres en base64url

/** Mismo criterio que el CHECK `usuario_correo_normalizado`: sin espacios en los bordes y en minúsculas. */
export const normalizarCorreo = (correo: string): string => correo.trim().toLowerCase();

/** Clave temporal aleatoria de 24 caracteres (144 bits), sin pasar por ningún generador pseudoaleatorio. */
export const generarClaveTemporal = (): string => randomBytes(LARGO_CLAVE_BYTES).toString('base64url');

function esRol(valor: string): valor is RolUsuario {
  return (ROLES as readonly string[]).includes(valor);
}

function buscarPorNombre(nombres: readonly string[], disponibles: Array<{ id: string; nombre: string }>, que: string): string[] {
  const ids: string[] = [];
  const desconocidos: string[] = [];
  for (const nombre of nombres) {
    const hallado = disponibles.find((d) => normalizar(d.nombre) === normalizar(nombre));
    if (hallado === undefined) desconocidos.push(nombre);
    else if (!ids.includes(hallado.id)) ids.push(hallado.id);
  }
  if (desconocidos.length > 0) throw new ErrorUsuarios(`No existe ${que}: ${desconocidos.map((n) => `«${n}»`).join(', ')}. Cárgalo antes con el comando de catálogos.`);
  return ids;
}

async function cuentaPorCorreo(prisma: PrismaClient, correo: string): Promise<{ id: string; correo: string; activo: boolean }> {
  const cuenta = await prisma.usuario.findUnique({ where: { correo: normalizarCorreo(correo) }, select: { id: true, correo: true, activo: true } });
  if (cuenta === null) throw new ErrorUsuarios(`No existe una cuenta con el correo ${normalizarCorreo(correo)}.`);
  return cuenta;
}

/** Crea la cuenta con su alcance y devuelve la clave temporal, que es la única vez que existe en claro. */
export async function crearUsuario(
  prisma: PrismaClient,
  contrasenas: Pick<ContrasenasService, 'hashear'>,
  datos: DatosUsuarioNuevo,
  generarClave: () => string = generarClaveTemporal,
): Promise<{ usuario: ResumenUsuario; claveTemporal: string }> {
  const correo = normalizarCorreo(datos.correo);
  const nombre = datos.nombre.trim();
  if (!CORREO.test(correo)) throw new ErrorUsuarios(`El correo «${datos.correo}» no es válido.`);
  if (nombre === '') throw new ErrorUsuarios('Indica el nombre de la persona.');
  if (!esRol(datos.rol)) throw new ErrorUsuarios(`El rol «${datos.rol}» no es válido. Usa ${ROLES.join(', ')}.`);
  const rol = datos.rol;
  if (rol === 'DIRECTOR_SECTORIAL' && (datos.sectores.length === 0 || datos.carreras.length > 0)) {
    throw new ErrorUsuarios('Un director sectorial necesita al menos un --sector y no lleva --carrera.');
  }
  if (rol === 'DIRECTOR_CARRERA' && (datos.carreras.length === 0 || datos.sectores.length > 0)) {
    throw new ErrorUsuarios('Un director de carrera necesita al menos una --carrera y no lleva --sector.');
  }
  if (rol === 'ASEGURAMIENTO_CALIDAD' && (datos.sectores.length > 0 || datos.carreras.length > 0)) {
    throw new ErrorUsuarios('Aseguramiento de calidad es un perfil de consulta: no lleva --sector ni --carrera.');
  }
  if ((await prisma.usuario.findUnique({ where: { correo }, select: { id: true } })) !== null) {
    throw new ErrorUsuarios(`Ya existe una cuenta con el correo ${correo}.`);
  }
  const sectorIds = buscarPorNombre(datos.sectores, await prisma.sector.findMany({ select: { id: true, nombre: true } }), 'el sector');
  const carreraIds = buscarPorNombre(datos.carreras, await prisma.carrera.findMany({ select: { id: true, nombre: true } }), 'la carrera');

  const claveTemporal = generarClave();
  const hashContrasena = await contrasenas.hashear(claveTemporal);
  await prisma.$transaction(async (tx) => {
    const { id } = await tx.usuario.create({ data: { correo, nombre, rol, hashContrasena }, select: { id: true } });
    await tx.usuarioSector.createMany({ data: sectorIds.map((sectorId) => ({ usuarioId: id, sectorId })) });
    await tx.usuarioCarrera.createMany({ data: carreraIds.map((carreraId) => ({ usuarioId: id, carreraId })) });
  });
  const [usuario] = await listarUsuarios(prisma, correo);
  if (usuario === undefined) throw new ErrorUsuarios('La cuenta recién creada no aparece en la base: revisa con «listar» antes de repetir el comando.');
  return { usuario, claveTemporal };
}

/** Desactiva la cuenta y revoca todas sus sesiones: el guard consulta la base en cada petición, así que cae al instante. */
export async function desactivarUsuario(prisma: PrismaClient, correo: string): Promise<{ sesionesRevocadas: number }> {
  const cuenta = await cuentaPorCorreo(prisma, correo);
  return prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: cuenta.id }, data: { activo: false } });
    const { count } = await tx.refreshToken.updateMany({ where: { usuarioId: cuenta.id, revocadoEn: null }, data: { revocadoEn: new Date() } });
    return { sesionesRevocadas: count };
  });
}

export async function activarUsuario(prisma: PrismaClient, correo: string): Promise<void> {
  const cuenta = await cuentaPorCorreo(prisma, correo);
  await prisma.usuario.update({ where: { id: cuenta.id }, data: { activo: true } });
}

/** Nueva clave temporal; limpia los intentos fallidos y el bloqueo, y cierra todas las sesiones abiertas. */
export async function restablecerClave(
  prisma: PrismaClient,
  contrasenas: Pick<ContrasenasService, 'hashear'>,
  correo: string,
  generarClave: () => string = generarClaveTemporal,
): Promise<{ claveTemporal: string; sesionesRevocadas: number }> {
  const cuenta = await cuentaPorCorreo(prisma, correo);
  const claveTemporal = generarClave();
  const hashContrasena = await contrasenas.hashear(claveTemporal);
  const { sesionesRevocadas } = await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: cuenta.id }, data: { hashContrasena, intentosFallidos: 0, bloqueadoHasta: null, ultimoFalloEn: null } });
    const { count } = await tx.refreshToken.updateMany({ where: { usuarioId: cuenta.id, revocadoEn: null }, data: { revocadoEn: new Date() } });
    return { sesionesRevocadas: count };
  });
  return { claveTemporal, sesionesRevocadas };
}

/** Nunca selecciona el hash: no hay manera de que salga en el listado. */
export async function listarUsuarios(prisma: PrismaClient, correo?: string): Promise<ResumenUsuario[]> {
  const filas = await prisma.usuario.findMany({
    where: correo === undefined ? {} : { correo: normalizarCorreo(correo) },
    orderBy: { correo: 'asc' },
    select: {
      correo: true,
      nombre: true,
      rol: true,
      activo: true,
      sectores: { select: { sector: { select: { nombre: true } } } },
      carreras: { select: { carrera: { select: { nombre: true } } } },
    },
  });
  return filas.map((f) => ({
    correo: f.correo,
    nombre: f.nombre,
    rol: f.rol,
    activo: f.activo,
    alcance: [...f.sectores.map((s) => s.sector.nombre), ...f.carreras.map((c) => c.carrera.nombre)].sort((a, b) => a.localeCompare(b, 'es')),
  }));
}
