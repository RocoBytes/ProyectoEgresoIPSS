import { Injectable, Logger } from '@nestjs/common';
import type { RespuestaSalud } from '@ipss/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SaludService {
  private readonly registro = new Logger(SaludService.name);

  constructor(private readonly prisma: PrismaService) {}

  async verificar(): Promise<RespuestaSalud> {
    const verificadoEn = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { estado: 'ok', baseDeDatos: 'ok', verificadoEn };
    } catch (error) {
      // Solo la última línea del mensaje (la causa): el objeto de error de Prisma puede
      // arrastrar la consulta y sus parámetros.
      const causa = error instanceof Error ? error.message.split('\n').filter((l) => l.trim() !== '').at(-1) : undefined;
      this.registro.warn(`La base de datos no responde: ${causa ?? 'error desconocido'}`);
      return { estado: 'error', baseDeDatos: 'sin_conexion', verificadoEn };
    }
  }
}
