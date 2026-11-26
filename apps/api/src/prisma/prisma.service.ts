import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { CONFIGURACION, type Configuracion } from '../configuracion';

// Tiempo máximo para obtener una conexión: sin él, una base caída dejaría
// colgada la comprobación de salud en vez de responder 503.
const ESPERA_CONEXION_MS = 5_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(CONFIGURACION) config: Configuracion) {
    const registro = new Logger(PrismaService.name);
    super({
      adapter: new PrismaPg(
        { connectionString: config.urlBaseDeDatos, connectionTimeoutMillis: ESPERA_CONEXION_MS },
        {
          // Sin este manejador, el 'error' de una conexión ociosa cortada por la base
          // tumbaría todo el proceso.
          onPoolError: (error) => registro.warn(`Conexión a la base perdida: ${error.message}`),
        },
      ),
    });
  }

  // No se conecta al arrancar: la API debe levantar y responder 503 si la base está caída.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
