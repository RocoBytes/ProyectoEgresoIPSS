import { Injectable, NotFoundException } from '@nestjs/common';
import type { RespuestaCatalogos, RespuestaObjetosCarrera } from '@ipss/shared';
import { deFechaBd } from '../comun/fecha-texto';
import { PrismaService } from '../prisma/prisma.service';

export const porNombre = (a: { nombre: string }, b: { nombre: string }): number => a.nombre.localeCompare(b.nombre, 'es');
const NOMBRE_OTRO = 'Otro';

/** Orden de los canales en toda la API: alfabético y «Otro» siempre al final. */
export const ordenarCanales = <T extends { nombre: string }>(canales: T[]): T[] =>
  canales.sort((a, b) => (a.nombre === NOMBRE_OTRO ? 1 : b.nombre === NOMBRE_OTRO ? -1 : porNombre(a, b)));

@Injectable()
export class CatalogosService {
  constructor(private readonly prisma: PrismaService) {}

  async catalogos(): Promise<RespuestaCatalogos> {
    const [sectores, carreras, canales] = await Promise.all([
      this.prisma.sector.findMany({ select: { id: true, nombre: true } }),
      this.prisma.carrera.findMany({ select: { id: true, nombre: true, sectorId: true } }),
      this.prisma.canal.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    ]);
    // Orden en JS y no en la base: no depende de la colación de PostgreSQL. «Otro» siempre al final.
    ordenarCanales(canales);
    return { sectores: sectores.sort(porNombre), carreras: carreras.sort(porNombre), canales };
  }

  async objetosDeCarrera(carreraId: string): Promise<RespuestaObjetosCarrera> {
    const carrera = await this.prisma.carrera.findUnique({
      where: { id: carreraId },
      select: {
        asignaturas: { select: { id: true, nombre: true, tipo: true } },
        mallas: { select: { id: true, anio: true, vigenteDesde: true }, orderBy: { anio: 'desc' } },
      },
    });
    if (carrera === null) throw new NotFoundException('No encontramos esa carrera');
    const referencia = ({ id, nombre }: { id: string; nombre: string }) => ({ id, nombre });
    return {
      asignaturas: carrera.asignaturas.filter((a) => a.tipo === 'ASIGNATURA').map(referencia).sort(porNombre),
      modulos: carrera.asignaturas.filter((a) => a.tipo === 'MODULO').map(referencia).sort(porNombre),
      versionesMalla: carrera.mallas.map((m) => ({ id: m.id, anio: m.anio, vigenteDesde: deFechaBd(m.vigenteDesde) })),
    };
  }
}
