import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { ContrasenasService } from '../acceso/contrasenas.service';
import { DIRECTORIO_EVIDENCIAS_DESARROLLO } from '../configuracion';
import { sembrarRegistros, type ResumenRegistros } from './sembrar-registros';
import { CANALES_EJEMPLO, CARRERAS_EJEMPLO, CLAVE_EJEMPLO, SECTORES_EJEMPLO, USUARIOS_EJEMPLO } from './datos-ejemplo';

export interface ResumenSemilla {
  sectores: number;
  carreras: number;
  asignaturas: number;
  canales: number;
  usuariosNuevos: number;
  datosDelPrototipo: ResumenRegistros;
}

function idDe(ids: ReadonlyMap<string, string>, nombre: string): string {
  const id = ids.get(nombre);
  if (id === undefined) throw new Error(`La semilla referencia "${nombre}", que no está en los datos de ejemplo`);
  return id;
}

/**
 * Carga los datos del prototipo. Se puede correr las veces que se quiera: los catálogos se
 * buscan por su clave natural y los usuarios existentes no se tocan (ni su contraseña).
 */
export async function sembrar(prisma: PrismaClient, directorioEvidencias = process.env['DIRECTORIO_EVIDENCIAS'] ?? DIRECTORIO_EVIDENCIAS_DESARROLLO): Promise<ResumenSemilla> {
  const sectores = new Map<string, string>();
  for (const nombre of SECTORES_EJEMPLO) {
    const sector = await prisma.sector.upsert({ where: { nombre }, create: { nombre }, update: {}, select: { id: true } });
    sectores.set(nombre, sector.id);
  }

  const carreras = new Map<string, string>();
  let asignaturas = 0;
  for (const datos of CARRERAS_EJEMPLO) {
    const sectorId = idDe(sectores, datos.sector);
    const carrera = await prisma.carrera.upsert({ where: { nombre: datos.nombre }, create: { nombre: datos.nombre, sectorId }, update: {}, select: { id: true } });
    carreras.set(datos.nombre, carrera.id);
    const filas = [
      ...datos.asignaturas.map((nombre) => ({ tipo: 'ASIGNATURA' as const, nombre })),
      ...datos.modulos.map((nombre) => ({ tipo: 'MODULO' as const, nombre })),
    ];
    for (const { tipo, nombre } of filas) {
      // `codigo` queda nulo: el prototipo no lo trae, y la clave natural es (carrera, tipo, nombre).
      await prisma.asignatura.upsert({
        where: { carreraId_tipo_nombre: { carreraId: carrera.id, tipo, nombre } },
        create: { carreraId: carrera.id, tipo, nombre },
        update: {},
      });
      asignaturas += 1;
    }
  }

  for (const nombre of CANALES_EJEMPLO) {
    await prisma.canal.upsert({ where: { nombre }, create: { nombre }, update: {} });
  }

  const contrasenas = new ContrasenasService();
  let usuariosNuevos = 0;
  for (const datos of USUARIOS_EJEMPLO) {
    let usuario = await prisma.usuario.findUnique({ where: { correo: datos.correo }, select: { id: true } });
    if (usuario === null) {
      usuario = await prisma.usuario.create({
        data: { correo: datos.correo, nombre: datos.nombre, rol: datos.rol, hashContrasena: await contrasenas.hashear(CLAVE_EJEMPLO) },
        select: { id: true },
      });
      usuariosNuevos += 1;
    }
    await prisma.usuarioSector.createMany({
      data: datos.sectores.map((nombre) => ({ usuarioId: usuario.id, sectorId: idDe(sectores, nombre) })),
      skipDuplicates: true,
    });
    await prisma.usuarioCarrera.createMany({
      data: datos.carreras.map((nombre) => ({ usuarioId: usuario.id, carreraId: idDe(carreras, nombre) })),
      skipDuplicates: true,
    });
  }

  const datosDelPrototipo = await sembrarRegistros(prisma, contrasenas, directorioEvidencias, { sectores, carreras });
  return { sectores: sectores.size, carreras: carreras.size, asignaturas, canales: CANALES_EJEMPLO.length, usuariosNuevos, datosDelPrototipo };
}

async function principal(): Promise<void> {
  // La semilla crea usuarios con una contraseña pública (está en el prototipo y en el repositorio).
  if (process.env['NODE_ENV'] === 'production') {
    console.error('La semilla de desarrollo no puede correr con NODE_ENV=production: crea usuarios con una contraseña conocida.');
    process.exit(1);
  }
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.trim() === '') {
    console.error('Falta la variable de entorno DATABASE_URL (conexión a la base con el rol ipss_api).');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const r = await sembrar(prisma);
    console.log(`Semilla aplicada: ${r.sectores} sectores, ${r.carreras} carreras, ${r.asignaturas} asignaturas y módulos, ${r.canales} canales y ${r.usuariosNuevos} usuarios nuevos, más ${r.datosDelPrototipo.usuariosInactivos} inactivos, ${r.datosDelPrototipo.mallas} mallas, ${r.datosDelPrototipo.sesiones} sesiones y ${r.datosDelPrototipo.registros} registros nuevos.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Solo corre al ejecutar el archivo (`npm run semilla`), no al importarlo desde una prueba.
if (require.main === module) {
  principal().catch((error: unknown) => {
    console.error(`La semilla falló: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
