import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALMACENAMIENTO_EVIDENCIAS, type AlmacenamientoEvidencias } from './almacenamiento';
import { sha256DeStream } from './validador-archivos';

export const MENSAJE_EVIDENCIA_DANADA = 'La evidencia está dañada; avisa al administrador del sistema.';

export interface ArchivoParaDescarga {
  nombreOriginal: string;
  mime: string;
  tamano: number;
  rutaRelativa: string;
}

@Injectable()
export class EvidenciasService {
  private readonly registro = new Logger(EvidenciasService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ALMACENAMIENTO_EVIDENCIAS) private readonly almacenamiento: AlmacenamientoEvidencias,
  ) {}

  /** Comprueba el SHA-256 guardado contra los bytes del disco antes de entregar nada. */
  async prepararDescarga(id: string): Promise<ArchivoParaDescarga> {
    const evidencia = await this.prisma.evidencia.findUnique({ where: { id } });
    if (evidencia === null) throw new NotFoundException('No encontramos esa evidencia');
    let hashActual: string | undefined;
    try {
      hashActual = await sha256DeStream(this.almacenamiento.abrir(evidencia.ruta));
    } catch {
      hashActual = undefined; // el archivo falta o no se puede leer: es el mismo daño para el usuario
    }
    if (hashActual !== evidencia.sha256) {
      // Solo el id de la evidencia: ni el nombre del archivo ni su ruta van a los logs.
      this.registro.error(`La evidencia ${id} no coincide con su SHA-256 guardado`);
      throw new InternalServerErrorException(MENSAJE_EVIDENCIA_DANADA);
    }
    return { nombreOriginal: evidencia.nombreOriginal, mime: evidencia.mime, tamano: evidencia.tamano, rutaRelativa: evidencia.ruta };
  }

  abrir(rutaRelativa: string): ReturnType<AlmacenamientoEvidencias['abrir']> {
    return this.almacenamiento.abrir(rutaRelativa);
  }
}
