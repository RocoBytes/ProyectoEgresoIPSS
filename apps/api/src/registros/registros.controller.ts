import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import type { DetalleRegistro, RespuestaAnios, RespuestaEdicion, RespuestaListadoRegistros } from '@ipss/shared';
import { Roles, TODOS_LOS_ROLES } from '../acceso/roles';
import { UsuarioActual, type UsuarioAutenticado } from '../acceso/usuario-autenticado';
import { EditarRegistroDto } from './dto/editar-registro.dto';
import { ListarRegistrosDto } from './dto/listar-registros.dto';
import { RegistrosService } from './registros.service';

// Un id mal formado es, para el usuario, un registro que no existe.
const idDeRegistro = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('No encontramos ese registro') });

@Controller('registros')
export class RegistrosController {
  constructor(private readonly registros: RegistrosService) {}

  @Roles(...TODOS_LOS_ROLES)
  @Get()
  listar(@Query() filtros: ListarRegistrosDto): Promise<RespuestaListadoRegistros> {
    return this.registros.listar(filtros);
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
}
