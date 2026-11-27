import type { Prisma } from '../generated/prisma/client';
import { aFechaBd } from '../comun/fecha-texto';
import type { ListarRegistrosDto } from './dto/listar-registros.dto';

// Prisma no escapa los comodines de LIKE: sin esto, buscar «%» o «_» devolvería todo.
const escaparComodines = (texto: string): string => texto.replace(/[\\%_]/g, '\\$&');

/** Más reciente primero; (año, número) es único, así que el orden es total. */
export const ORDEN_DE_REGISTROS: Prisma.RegistroOrderByWithRelationInput[] = [{ sesion: { fecha: 'desc' } }, { anio: 'desc' }, { numero: 'desc' }];

/**
 * Filtros de `GET /api/registros` y de `GET /api/registros/exportar`. Un solo lugar: lo que se exporta es exactamente lo que el listado muestra.
 * El año es el de la fecha de la SESIÓN y «vencido» es abierto con fecha comprometida anterior a `hoy`.
 */
export function condicionesDeRegistros(f: ListarRegistrosDto, hoy: Date): Prisma.RegistroWhereInput {
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
