import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import type { RespuestaMallas, VersionMallaListada } from '@ipss/shared';
import { Roles, TODOS_LOS_ROLES } from '../acceso/roles';
import { UsuarioActual, type UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { SubidaMallaInterceptor } from '../evidencias/subida-evidencias.interceptor';
import { ListarMallasDto } from './dto/listar-mallas.dto';
import { MallasService } from './mallas.service';

@Controller('mallas')
export class MallasController {
  constructor(private readonly mallas: MallasService) {}

  @Roles(...TODOS_LOS_ROLES)
  @Get()
  listar(@UsuarioActual() usuario: UsuarioAutenticado, @Query() filtros: ListarMallasDto): Promise<RespuestaMallas> {
    return this.mallas.listar(usuario, filtros.carreraId);
  }

  // multipart/form-data: `datos` trae el JSON { carreraId, anio, vigenteDesde } y `archivo` el PDF.
  @Roles('DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA')
  @UseInterceptors(SubidaMallaInterceptor)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  subir(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body('datos') datos: string | undefined,
    @UploadedFiles() archivos: { archivo?: Express.Multer.File[] } | undefined,
  ): Promise<VersionMallaListada> {
    return this.mallas.subir(usuario, datos, archivos?.archivo?.[0]);
  }
}
