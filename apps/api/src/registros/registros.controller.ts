import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import type { DetalleRegistro, RespuestaAnios, RespuestaCambioEstado, RespuestaEdicion, RespuestaListadoRegistros } from '@ipss/shared';
import { Roles, TODOS_LOS_ROLES } from '../acceso/roles';
import { UsuarioActual, type UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { SubidaEvidenciaCierreInterceptor } from '../evidencias/subida-evidencias.interceptor';
import { AnularRegistroDto } from './dto/anular-registro.dto';
import { CierreAnulacionService } from './cierre-anulacion.service';
import { EditarRegistroDto } from './dto/editar-registro.dto';
import { ListarRegistrosDto } from './dto/listar-registros.dto';
import { ExportacionRegistrosService } from './exportacion-registros.service';
import { RegistrosService } from './registros.service';

// Un id mal formado es, para el usuario, un registro que no existe.
const idDeRegistro = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('No encontramos ese registro') });

@Controller('registros')
export class RegistrosController {
  constructor(
    private readonly registros: RegistrosService,
    private readonly cierres: CierreAnulacionService,
    private readonly exportacion: ExportacionRegistrosService,
  ) {}

  @Roles(...TODOS_LOS_ROLES)
  @Get()
  listar(@Query() filtros: ListarRegistrosDto): Promise<RespuestaListadoRegistros> {
    return this.registros.listar(filtros);
  }

  // Mismos filtros y orden que el listado, sin paginar. Declarada antes que ':id'.
  @Roles(...TODOS_LOS_ROLES)
  @Get('exportar')
  exportar(@Query() filtros: ListarRegistrosDto, @Res() respuesta: Response): Promise<void> {
    return this.exportacion.exportar(filtros, respuesta);
  }

  // Declarada antes que ':id' para que 'anios' no se lea como un id.
  @Roles(...TODOS_LOS_ROLES)
  @Get('anios')
  anios(): Promise<RespuestaAnios> {
    return this.registros.anios();
  }

  @Roles(...TODOS_LOS_ROLES)
  @Get(':id')
  detalle(@UsuarioActual() usuario: UsuarioAutenticado, @Param('id', idDeRegistro) id: string): Promise<DetalleRegistro> {
    return this.registros.detalle(usuario, id);
  }

  @Roles('DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA')
  @Patch(':id')
  editar(@UsuarioActual() usuario: UsuarioAutenticado, @Param('id', idDeRegistro) id: string, @Body() cuerpo: EditarRegistroDto): Promise<RespuestaEdicion> {
    return this.registros.editar(usuario, id, cuerpo);
  }

  // multipart/form-data: `datos` trae el JSON ({ fechaEfectiva, comentario? }) y `evidencia` el archivo.
  @Roles('DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA')
  @UseInterceptors(SubidaEvidenciaCierreInterceptor)
  @Post(':id/cierre')
  @HttpCode(HttpStatus.OK)
  cerrar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', idDeRegistro) id: string,
    @Body('datos') datos: string | undefined,
    @UploadedFiles() archivos: { evidencia?: Express.Multer.File[] } | undefined,
  ): Promise<RespuestaCambioEstado> {
    return this.cierres.cerrar(usuario, id, datos, archivos?.evidencia?.[0]);
  }

  @Roles('DIRECTOR_SECTORIAL', 'DIRECTOR_CARRERA')
  @Post(':id/anulacion')
  @HttpCode(HttpStatus.OK)
  anular(@UsuarioActual() usuario: UsuarioAutenticado, @Param('id', idDeRegistro) id: string, @Body() cuerpo: AnularRegistroDto): Promise<RespuestaCambioEstado> {
    return this.cierres.anular(usuario, id, cuerpo.motivo);
  }
}
