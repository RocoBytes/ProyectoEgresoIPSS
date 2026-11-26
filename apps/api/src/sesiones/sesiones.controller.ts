import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import type { RespuestaSesionCreada } from '@ipss/shared';
import { Roles } from '../acceso/roles';
import { UsuarioActual, type UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { SubidaEvidenciasInterceptor } from '../evidencias/subida-evidencias.interceptor';
import { type ArchivosSubidos, SesionesService } from './sesiones.service';

@Controller('sesiones')
export class SesionesController {
  constructor(private readonly sesiones: SesionesService) {}

  // multipart/form-data: el campo `datos` trae el JSON y `acta` / `fotos` los archivos.
  @Roles('DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA')
  @UseInterceptors(SubidaEvidenciasInterceptor)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body('datos') datos: string | undefined,
    @UploadedFiles() archivos: ArchivosSubidos | undefined,
  ): Promise<RespuestaSesionCreada> {
    return this.sesiones.crear(usuario, datos, archivos ?? {});
  }
}
