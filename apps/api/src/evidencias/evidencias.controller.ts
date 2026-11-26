import { pipeline } from 'node:stream/promises';
import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles, TODOS_LOS_ROLES } from '../acceso/roles';
import { EvidenciasService } from './evidencias.service';

/** Cabecera Content-Disposition con respaldo ASCII y el nombre real en UTF-8 (RFC 6266 / 5987). */
export function dispositionDe(nombre: string): string {
  const respaldo = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const codificado = encodeURIComponent(nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${respaldo}"; filename*=UTF-8''${codificado}`;
}

@Controller('evidencias')
export class EvidenciasController {
  constructor(private readonly evidencias: EvidenciasService) {}

  // La descarga es siempre por la API y con sesión; nunca se sirve el directorio de archivos.
  @Roles(...TODOS_LOS_ROLES)
  @Get(':id/descarga')
  async descargar(
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('El identificador de la evidencia no es válido') })) id: string,
    @Res() respuesta: Response,
  ): Promise<void> {
    const archivo = await this.evidencias.prepararDescarga(id);
    respuesta.setHeader('Content-Type', archivo.mime);
    respuesta.setHeader('Content-Length', String(archivo.tamano));
    respuesta.setHeader('Content-Disposition', dispositionDe(archivo.nombreOriginal));
    // El archivo lo subió un usuario: ni se interpreta distinto a lo declarado ni puede ejecutar nada.
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    respuesta.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    respuesta.setHeader('Cache-Control', 'private, no-store');
    try {
      await pipeline(this.evidencias.abrir(archivo.rutaRelativa), respuesta);
    } catch (error) {
      // Con las cabeceras ya enviadas el filtro global no puede responder: se corta la conexión.
      if (!respuesta.headersSent) throw error;
      respuesta.destroy();
    }
  }
}
