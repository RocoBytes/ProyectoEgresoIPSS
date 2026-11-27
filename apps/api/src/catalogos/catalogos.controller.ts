import { BadRequestException, Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { RespuestaCatalogos, RespuestaObjetosCarrera } from '@ipss/shared';
import { Roles, TODOS_LOS_ROLES } from '../acceso/roles';
import { CatalogosService } from './catalogos.service';

@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  @Roles(...TODOS_LOS_ROLES)
  @Get()
  listar(): Promise<RespuestaCatalogos> {
    return this.catalogos.catalogos();
  }

  @Roles(...TODOS_LOS_ROLES)
  @Get('carreras/:id/objetos')
  objetos(@Param('id', new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException('El identificador de la carrera no es válido') })) id: string): Promise<RespuestaObjetosCarrera> {
    return this.catalogos.objetosDeCarrera(id);
  }
}
