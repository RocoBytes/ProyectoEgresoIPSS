import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContrasenasService } from '../acceso/contrasenas.service';
import { aFechaBd } from '../comun/fecha-texto';
import { SUBDIRECTORIO_ENTRANTES, DiscoLocal } from '../evidencias/disco-local';
import { sha256DeArchivo } from '../evidencias/validador-archivos';
import type { PrismaClient } from '../generated/prisma/client';
import { MALLAS_EJEMPLO, SESIONES_EJEMPLO, USUARIOS_INACTIVOS_EJEMPLO } from './datos-sesiones-ejemplo';

export interface ResumenRegistros {
  usuariosInactivos: number;
  mallas: number;
  sesiones: number;
  registros: number;
}

// Bytes mínimos con la firma real de cada formato: la API valida el tipo por contenido.
const PNG_MINIMO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHP9NuAAAAABJRU5ErkJggg==', 'base64');
const JPG_MINIMO = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');

interface Relleno {
  mime: string;
  contenido: Buffer;
}

/** PDF o imagen de relleno. El PDF lleva el nombre dentro para que cada archivo tenga su propio SHA-256. */
function rellenoDe(nombre: string): Relleno {
  if (/\.jpe?g$/i.test(nombre)) return { mime: 'image/jpeg', contenido: Buffer.concat([JPG_MINIMO, Buffer.from(nombre)]) };
  if (/\.png$/i.test(nombre)) return { mime: 'image/png', contenido: Buffer.concat([PNG_MINIMO, Buffer.from(nombre)]) };
  return { mime: 'application/pdf', contenido: Buffer.from(`%PDF-1.4\n% Archivo de relleno de la semilla: ${nombre}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`) };
}

export async function sembrarRegistros(prisma: PrismaClient, contrasenas: ContrasenasService, directorioEvidencias: string, ids: { sectores: ReadonlyMap<string, string>; carreras: ReadonlyMap<string, string> }): Promise<ResumenRegistros> {
  const almacenamiento = new DiscoLocal({ directorioEvidencias } as ConstructorParameters<typeof DiscoLocal>[0]);
  await almacenamiento.onModuleInit();
  const entrantes = join(directorioEvidencias, SUBDIRECTORIO_ENTRANTES);
  await mkdir(entrantes, { recursive: true });

  // Los archivos de relleno pasan por el almacenamiento real: mismo camino que una subida (UUID, SHA-256 verificable).
  const guardar = async (nombre: string, usuarioId: string, sesionId: string | null): Promise<string> => {
    const { mime, contenido } = rellenoDe(nombre);
    const temporal = join(entrantes, randomUUID());
    await writeFile(temporal, contenido);
    const sha256 = await sha256DeArchivo(temporal);
    const ruta = await almacenamiento.incorporar(temporal);
    const fila = await prisma.evidencia.create({ data: { sesionId, nombreOriginal: nombre, mime, tamano: contenido.length, sha256, ruta, subidoPor: usuarioId }, select: { id: true } });
    return fila.id;
  };

  // Andrea y Rodrigo aparecen en el prototipo como autores, pero no son cuentas de la demostración:
  // inactivos y con un hash de una contraseña aleatoria que nadie conoce.
  let usuariosInactivos = 0;
  for (const u of USUARIOS_INACTIVOS_EJEMPLO) {
    const existente = await prisma.usuario.findUnique({ where: { correo: u.correo }, select: { id: true } });
    if (existente !== null) continue;
    const usuario = await prisma.usuario.create({ data: { correo: u.correo, nombre: u.nombre, rol: u.rol, activo: false, hashContrasena: await contrasenas.hashear(randomBytes(24).toString('base64url')) }, select: { id: true } });
    await prisma.usuarioSector.createMany({ data: u.sectores.map((n) => ({ usuarioId: usuario.id, sectorId: ids.sectores.get(n) ?? '' })), skipDuplicates: true });
    await prisma.usuarioCarrera.createMany({ data: u.carreras.map((n) => ({ usuarioId: usuario.id, carreraId: ids.carreras.get(n) ?? '' })), skipDuplicates: true });
    usuariosInactivos += 1;
  }

  const usuarios = new Map((await prisma.usuario.findMany({ select: { id: true, nombre: true } })).map((u) => [u.nombre, u.id]));
  const usuarioId = (nombre: string): string => {
    const id = usuarios.get(nombre);
    if (id === undefined) throw new Error(`La semilla referencia al usuario "${nombre}", que no existe`);
    return id;
  };
  const carreraId = (nombre: string): string => {
    const id = ids.carreras.get(nombre);
    if (id === undefined) throw new Error(`La semilla referencia la carrera "${nombre}", que no existe`);
    return id;
  };

  let mallas = 0;
  for (const m of MALLAS_EJEMPLO) {
    const existente = await prisma.versionMalla.findUnique({ where: { carreraId_anio: { carreraId: carreraId(m.carrera), anio: m.anio } }, select: { id: true } });
    if (existente !== null) continue;
    const archivoId = await guardar(`Malla ${m.carrera} ${m.anio}.pdf`, usuarioId(m.subidoPor), null);
    await prisma.versionMalla.create({ data: { carreraId: carreraId(m.carrera), anio: m.anio, vigenteDesde: aFechaBd(m.vigenteDesde), archivoId } });
    mallas += 1;
  }

  let sesiones = 0;
  let registros = 0;
  for (const s of SESIONES_EJEMPLO) {
    // Idempotencia: una sesión con la misma fecha e instancia ya está sembrada.
    if ((await prisma.sesion.count({ where: { fecha: aFechaBd(s.fecha), instancia: s.instancia } })) > 0) continue;
    const canal = await prisma.canal.findUniqueOrThrow({ where: { nombre: s.canal }, select: { id: true } });
    const autor = usuarioId(s.creadoPor);
    const sesion = await prisma.sesion.create({ data: { canalId: canal.id, fecha: aFechaBd(s.fecha), instancia: s.instancia, participantes: s.participantes, creadoPor: autor }, select: { id: true } });
    await guardar(s.acta, autor, sesion.id);
    for (const foto of s.fotos) await guardar(foto, autor, sesion.id);
    sesiones += 1;
    for (const r of s.registros) {
      const carrera = carreraId(r.carrera);
      const asignatura = r.nivel === 'MALLA' || r.objeto === undefined ? null : await prisma.asignatura.findFirstOrThrow({ where: { carreraId: carrera, nombre: r.objeto, tipo: r.nivel === 'MODULO' ? 'MODULO' : 'ASIGNATURA' }, select: { id: true } });
      const malla = r.nivel === 'MALLA' ? await prisma.versionMalla.findUniqueOrThrow({ where: { carreraId_anio: { carreraId: carrera, anio: Number(r.objeto) } }, select: { id: true } }) : null;
      const creado = await prisma.registro.create({
        data: { sesionId: sesion.id, carreraId: carrera, nivelImpacto: r.nivel, asignaturaId: asignatura?.id ?? null, versionMallaId: malla?.id ?? null, recurso: r.recurso ?? null, descripcion: r.descripcion, fechaComprometida: aFechaBd(r.comprometida), actualizadoPor: autor },
        select: { id: true },
      });
      registros += 1;
      if (r.fin?.efectiva !== undefined && r.fin.archivo !== undefined) {
        const evidenciaCierreId = await guardar(r.fin.archivo, usuarioId(r.fin.por), null);
        await prisma.registro.update({ where: { id: creado.id }, data: { estado: 'CERRADO', fechaEfectiva: aFechaBd(r.fin.efectiva), evidenciaCierreId, comentarioCierre: r.fin.comentario ?? null, actualizadoPor: usuarioId(r.fin.por) } });
      } else if (r.fin?.motivo !== undefined) {
        await prisma.registro.update({ where: { id: creado.id }, data: { estado: 'ANULADO', motivoAnulacion: r.fin.motivo, actualizadoPor: usuarioId(r.fin.por) } });
      }
    }
  }
  return { usuariosInactivos, mallas, sesiones, registros };
}
