import { Controller, Get, Query } from '@nestjs/common';
import type { RespuestaPanel } from '@ipss/shared';
import { Roles, TODOS_LOS_ROLES } from '../acceso/roles';
import { PanelDto } from './dto/panel.dto';
import { ReportesService } from './reportes.service';

@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Roles(...TODOS_LOS_ROLES)
  @Get('panel')
  panel(@Query() filtros: PanelDto): Promise<RespuestaPanel> {
    return this.reportes.panel(filtros);
  }
}
