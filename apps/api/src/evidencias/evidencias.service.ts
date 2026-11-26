import type { FileHandle } from 'node:fs/promises';
import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALMACENAMIENTO_EVIDENCIAS, type AlmacenamientoEvidencias } from './almacenamiento';
import { sha256DeStream } from './validador-archivos';

export const MENSAJE_EVIDENCIA_DANADA = 'La evidencia está dañada; avisa al administrador del sistema.';

export interface ArchivoParaDescarga {
  nombreOriginal: string;
  mime: string;
  tamano: number;
}

@Injectable()
export class EvidenciasService {
  private readonly registro = new Logger(EvidenciasService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ALMACENAMIENTO_EVIDENCIAS) private readonly almacenamiento: AlmacenamientoEvidencias,
  ) {}

  /**
   * Abre el archivo UNA vez, verifica su SHA-256 leyendo ese manejador y lo entrega abierto: los bytes
   * que se verificaron son los que se envían, aunque el archivo se reemplace o borre después.
   */
  async prepararDescarga(id: string): Promise<{ archivo: ArchivoParaDescarga; manejador: FileHandle }> {
    const evidencia = await this.prisma.evidencia.findUnique({ where: { id } });
    if (evidencia === null) throw new NotFoundException('No encontramos esa evidencia');
    let manejador: FileHandle | undefined;
    let hashActual: string | undefined;
    try {
      manejador = await this.almacenamiento.abrir(evidencia.ruta);
      hashActual = await sha256DeStream(manejador.createReadStream({ start: 0, autoClose: false }));
    } catch {
      hashActual = undefined; // el archivo falta o no se puede leer: es el mismo daño para el usuario
    }
    if (manejador === undefined || hashActual !== evidencia.sha256) {
      await manejador?.close().catch(() => undefined);
      // Solo el id de la evidencia: ni el nombre del archivo ni su ruta van a los logs.
      this.registro.error(`La evidencia ${id} no coincide con su SHA-256 guardado`);
      throw new InternalServerErrorException(MENSAJE_EVIDENCIA_DANADA);
    }
    return { archivo: { nombreOriginal: evidencia.nombreOriginal, mime: evidencia.mime, tamano: evidencia.tamano }, manejador };
  }
}
