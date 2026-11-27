import { Inject, Injectable } from '@nestjs/common';
import type { ConteoPorEstado, NivelImpacto, PanelAnio, PanelCanal, PanelGrupo, PanelMes, PanelNivel, PanelSesion, RespuestaPanel } from '@ipss/shared';
import { ordenarCanales, porNombre } from '../catalogos/catalogos.service';
import { hoyEnSantiago } from '../comun/fecha-texto';
import { RELOJ, type Reloj } from '../comun/reloj';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PanelDto } from './dto/panel.dto';

const NIVELES: readonly NivelImpacto[] = ['RECURSO', 'ASIGNATURA', 'MODULO', 'MALLA', 'PERFIL_INGRESO', 'PERFIL_EGRESO'];
const MAXIMO_SESIONES = 5;

type Estado = 'ABIERTO' | 'CERRADO' | 'ANULADO';

const sinConteo = (): ConteoPorEstado => ({ cerrados: 0, abiertos: 0, anulados: 0 });
const sumar = (c: ConteoPorEstado, estado: Estado, n: number): void => {
  if (estado === 'CERRADO') c.cerrados += n;
  else if (estado === 'ABIERTO') c.abiertos += n;
  else c.anulados += n;
};
const totalDe = (c: ConteoPorEstado): number => c.cerrados + c.abiertos + c.anulados;

/** Indicadores del panel. Todo se agrega en la base; el año de un registro es el de la fecha de su sesión, no el del correlativo. */
@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async panel(filtros: PanelDto): Promise<RespuestaPanel> {
    const hoy = hoyEnSantiago(this.reloj);
    const aniosDisponibles = await this.aniosDisponibles();
    const anio = filtros.anio ?? this.anioPorDefecto(aniosDisponibles, Number(hoy.slice(0, 4)));

    // Siempre valores enlazados (`${}`), nunca texto concatenado.
    const alcance = Prisma.sql`${filtros.sectorId === undefined ? Prisma.empty : Prisma.sql`AND ca.sector_id = ${filtros.sectorId}::uuid`} ${filtros.carreraId === undefined ? Prisma.empty : Prisma.sql`AND ca.id = ${filtros.carreraId}::uuid`}`;
    const delAnio = Prisma.sql`AND EXTRACT(YEAR FROM s.fecha)::int = ${anio}::int`;

    const [mensual, cifras, canales, niveles, grupos, sesiones, carrerasEnAlcance] = await Promise.all([
      this.mensual(alcance),
      this.cifras(alcance, delAnio, hoy),
      this.porCanal(alcance, delAnio),
      this.porNivel(alcance, delAnio),
      this.porGrupo(alcance, delAnio, filtros.sectorId !== undefined),
      this.ultimasSesiones(alcance, delAnio),
      this.prisma.carrera.count({ where: { ...(filtros.sectorId === undefined ? {} : { sectorId: filtros.sectorId }), ...(filtros.carreraId === undefined ? {} : { id: filtros.carreraId }) } }),
    ]);

    const porMes: PanelMes[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ...sinConteo(), total: 0 }));
    const totalesAnio = sinConteo();
    const porAnio: PanelAnio[] = aniosDisponibles.map((a) => ({ anio: a, total: 0, meses: Array<number>(12).fill(0) }));
    for (const f of mensual) {
      const fila = porAnio.find((x) => x.anio === f.anio);
      if (fila !== undefined) {
        fila.total += f.n;
        fila.meses[f.mes - 1] = (fila.meses[f.mes - 1] ?? 0) + f.n;
      }
      if (f.anio === anio) {
        const m = porMes[f.mes - 1];
        if (m !== undefined) {
          sumar(m, f.estado, f.n);
          m.total += f.n;
        }
        sumar(totalesAnio, f.estado, f.n);
      }
    }
    const total = totalDe(totalesAnio);
    const previo = anio - 1;

    return {
      anio,
      hoy,
      aniosDisponibles,
      indicadores: {
        total,
        abiertos: totalesAnio.abiertos,
        vencidos: cifras.vencidos,
        cerrados: totalesAnio.cerrados,
        anulados: totalesAnio.anulados,
        vigentes: total - totalesAnio.anulados,
        enPlazo: cifras.enPlazo,
        carrerasConAjustes: cifras.carreras,
        carrerasEnAlcance,
        totalAnioAnterior: aniosDisponibles.includes(previo) ? (porAnio.find((x) => x.anio === previo)?.total ?? 0) : null,
      },
      porMes,
      porAnio,
      porCanal: canales,
      porNivel: niveles,
      porGrupo: grupos,
      ultimasSesiones: sesiones,
    };
  }

  /** El año en curso si tiene registros; si no, el más reciente que los tenga; sin datos, el año en curso. */
  private anioPorDefecto(disponibles: number[], actual: number): number {
    return disponibles.includes(actual) ? actual : (disponibles[0] ?? actual);
  }

  private async aniosDisponibles(): Promise<number[]> {
    const filas = await this.prisma.$queryRaw<Array<{ anio: number }>>`SELECT DISTINCT EXTRACT(YEAR FROM s.fecha)::int AS anio FROM sesion s WHERE EXISTS (SELECT 1 FROM registro r WHERE r.sesion_id = s.id) ORDER BY 1 DESC`;
    return filas.map((f) => f.anio);
  }

  /** Un solo recorrido por año, mes y estado alimenta las series por mes y por año y el comparativo con el año anterior. */
  private async mensual(alcance: Prisma.Sql): Promise<Array<{ anio: number; mes: number; estado: Estado; n: number }>> {
    return this.prisma.$queryRaw`
      SELECT EXTRACT(YEAR FROM s.fecha)::int AS anio, EXTRACT(MONTH FROM s.fecha)::int AS mes, r.estado::text AS estado, count(*)::int AS n
      FROM registro r JOIN sesion s ON s.id = r.sesion_id JOIN carrera ca ON ca.id = r.carrera_id
      WHERE TRUE ${alcance}
      GROUP BY 1, 2, 3`;
  }

  private async cifras(alcance: Prisma.Sql, delAnio: Prisma.Sql, hoy: string): Promise<{ vencidos: number; enPlazo: number; carreras: number }> {
    const filas = await this.prisma.$queryRaw<Array<{ vencidos: number; en_plazo: number; carreras: number }>>`
      SELECT count(*) FILTER (WHERE r.estado = 'ABIERTO' AND r.fecha_comprometida < ${hoy}::date)::int AS vencidos,
             count(*) FILTER (WHERE r.estado = 'CERRADO' AND r.fecha_efectiva <= r.fecha_comprometida)::int AS en_plazo,
             count(DISTINCT r.carrera_id)::int AS carreras
      FROM registro r JOIN sesion s ON s.id = r.sesion_id JOIN carrera ca ON ca.id = r.carrera_id
      WHERE TRUE ${alcance} ${delAnio}`;
    const f = filas[0];
    return { vencidos: f?.vencidos ?? 0, enPlazo: f?.en_plazo ?? 0, carreras: f?.carreras ?? 0 };
  }

  private async porCanal(alcance: Prisma.Sql, delAnio: Prisma.Sql): Promise<PanelCanal[]> {
    const filas = await this.prisma.$queryRaw<Array<{ id: string; nombre: string; n: number }>>`
      SELECT cn.id, cn.nombre, count(*)::int AS n
      FROM registro r JOIN sesion s ON s.id = r.sesion_id JOIN carrera ca ON ca.id = r.carrera_id JOIN canal cn ON cn.id = s.canal_id
      WHERE TRUE ${alcance} ${delAnio}
      GROUP BY cn.id, cn.nombre`;
    return ordenarCanales(filas.map((f) => ({ id: f.id, nombre: f.nombre, total: f.n })));
  }

  private async porNivel(alcance: Prisma.Sql, delAnio: Prisma.Sql): Promise<PanelNivel[]> {
    const filas = await this.prisma.$queryRaw<Array<{ nivel: NivelImpacto; n: number }>>`
      SELECT r.nivel_impacto::text AS nivel, count(*)::int AS n
      FROM registro r JOIN sesion s ON s.id = r.sesion_id JOIN carrera ca ON ca.id = r.carrera_id
      WHERE TRUE ${alcance} ${delAnio}
      GROUP BY 1`;
    return NIVELES.flatMap((nivel) => {
      const n = filas.find((f) => f.nivel === nivel)?.n ?? 0;
      return n > 0 ? [{ nivel, total: n }] : [];
    });
  }

  /** Por sector; con un sector elegido, por carrera de ese sector. */
  private async porGrupo(alcance: Prisma.Sql, delAnio: Prisma.Sql, porCarrera: boolean): Promise<PanelGrupo[]> {
    const filas = porCarrera
      ? await this.prisma.$queryRaw<Array<{ id: string; nombre: string; estado: Estado; n: number }>>`
          SELECT ca.id, ca.nombre, r.estado::text AS estado, count(*)::int AS n
          FROM registro r JOIN sesion s ON s.id = r.sesion_id JOIN carrera ca ON ca.id = r.carrera_id
          WHERE TRUE ${alcance} ${delAnio}
          GROUP BY ca.id, ca.nombre, r.estado`
      : await this.prisma.$queryRaw<Array<{ id: string; nombre: string; estado: Estado; n: number }>>`
          SELECT se.id, se.nombre, r.estado::text AS estado, count(*)::int AS n
          FROM registro r JOIN sesion s ON s.id = r.sesion_id JOIN carrera ca ON ca.id = r.carrera_id JOIN sector se ON se.id = ca.sector_id
          WHERE TRUE ${alcance} ${delAnio}
          GROUP BY se.id, se.nombre, r.estado`;
    const grupos = new Map<string, PanelGrupo>();
    for (const f of filas) {
      const g = grupos.get(f.id) ?? { tipo: porCarrera ? ('CARRERA' as const) : ('SECTOR' as const), id: f.id, nombre: f.nombre, ...sinConteo(), total: 0 };
      sumar(g, f.estado, f.n);
      g.total += f.n;
      grupos.set(f.id, g);
    }
    // Mismo orden que GET /api/catalogos, en JS y no en la base.
    return [...grupos.values()].sort(porNombre);
  }

  private async ultimasSesiones(alcance: Prisma.Sql, delAnio: Prisma.Sql): Promise<PanelSesion[]> {
    const filas = await this.prisma.$queryRaw<Array<{ id: string; fecha: string; instancia: string; canal: string; creado_por: string; ajustes: number; primero: string }>>`
      SELECT s.id, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.instancia, cn.nombre AS canal, u.nombre AS creado_por,
             count(*)::int AS ajustes, (array_agg(r.id ORDER BY r.anio, r.numero))[1] AS primero
      FROM registro r JOIN sesion s ON s.id = r.sesion_id JOIN carrera ca ON ca.id = r.carrera_id
           JOIN canal cn ON cn.id = s.canal_id JOIN usuario u ON u.id = s.creado_por
      WHERE TRUE ${alcance} ${delAnio}
      GROUP BY s.id, s.fecha, s.instancia, s.creado_en, cn.nombre, u.nombre
      ORDER BY s.fecha DESC, s.creado_en DESC, s.id DESC
      LIMIT ${MAXIMO_SESIONES}::int`;
    return filas.map((f) => ({ id: f.id, fecha: f.fecha, instancia: f.instancia, canal: f.canal, creadoPor: f.creado_por, ajustes: f.ajustes, primerRegistroId: f.primero }));
  }
}
