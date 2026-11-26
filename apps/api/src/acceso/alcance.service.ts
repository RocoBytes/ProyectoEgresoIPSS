import { Injectable } from '@nestjs/common';
import type { Alcance, ReferenciaNombrada } from '@ipss/shared';
import { PrismaService } from '../prisma/prisma.service';
import { unirConConjuncion } from './conjuncion';
import type { UsuarioAutenticado } from './usuario-autenticado';

const DESCRIPCION_CALIDAD = 'Consulta de todos los sectores';

// Orden por nombre en JS y no en la base: el resultado no depende de la colación de PostgreSQL.
const porNombre = (a: ReferenciaNombrada, b: ReferenciaNombrada): number => a.nombre.localeCompare(b.nombre, 'es');

/**
 * Decide qué carreras puede modificar cada rol (ADR 0002). Lo usa /yo y lo usarán los módulos
 * de sesiones y registros; ver una carrera es otra cosa y no se limita aquí.
 */
@Injectable()
export class AlcanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Dirección Sectorial: las carreras de sus sectores. Dirección de Carrera: las suyas. Calidad: ninguna. */
  async carrerasModificables(usuario: UsuarioAutenticado): Promise<ReferenciaNombrada[]> {
    const filas = await this.consultarCarreras(usuario);
    return filas.sort(porNombre);
  }

  async puedeModificarCarrera(usuario: UsuarioAutenticado, carreraId: string): Promise<boolean> {
    switch (usuario.rol) {
      case 'DIRECTOR_SECTORIAL':
        return (await this.prisma.carrera.count({ where: { id: carreraId, sector: { usuarios: { some: { usuarioId: usuario.id } } } } })) > 0;
      case 'DIRECTOR_CARRERA':
        return (await this.prisma.usuarioCarrera.count({ where: { usuarioId: usuario.id, carreraId } })) > 0;
      case 'ASEGURAMIENTO_CALIDAD':
        return false;
    }
  }

  async alcanceDe(usuario: UsuarioAutenticado): Promise<Alcance> {
    switch (usuario.rol) {
      case 'DIRECTOR_SECTORIAL': {
        const sectores = (
          await this.prisma.sector.findMany({
            where: { usuarios: { some: { usuarioId: usuario.id } } },
            select: { id: true, nombre: true },
          })
        ).sort(porNombre);
        const carreras = await this.carrerasModificables(usuario);
        return { descripcion: unirConConjuncion(sectores.map((s) => s.nombre)), sectores, carreras };
      }
      case 'DIRECTOR_CARRERA': {
        const carreras = await this.carrerasModificables(usuario);
        return { descripcion: unirConConjuncion(carreras.map((c) => c.nombre)), sectores: [], carreras };
      }
      case 'ASEGURAMIENTO_CALIDAD':
        return { descripcion: DESCRIPCION_CALIDAD, sectores: [], carreras: [] };
    }
  }

  private consultarCarreras(usuario: UsuarioAutenticado): Promise<ReferenciaNombrada[]> {
    switch (usuario.rol) {
      case 'DIRECTOR_SECTORIAL':
        return this.prisma.carrera.findMany({
          where: { sector: { usuarios: { some: { usuarioId: usuario.id } } } },
          select: { id: true, nombre: true },
        });
      case 'DIRECTOR_CARRERA':
        return this.prisma.carrera.findMany({
          where: { usuarios: { some: { usuarioId: usuario.id } } },
          select: { id: true, nombre: true },
        });
      case 'ASEGURAMIENTO_CALIDAD':
        return Promise.resolve([]);
    }
  }
}
