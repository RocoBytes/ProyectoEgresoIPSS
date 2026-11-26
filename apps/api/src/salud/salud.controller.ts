import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RespuestaSalud } from '@ipss/shared';
import { Publica } from '../acceso/roles';
import { SaludService } from './salud.service';

// Pública a propósito: lo consultan Compose y el balanceador antes de que exista sesión.
@Publica()
@Controller('salud')
export class SaludController {
  constructor(private readonly salud: SaludService) {}

  @Get()
  async consultar(@Res({ passthrough: true }) respuesta: Response): Promise<RespuestaSalud> {
    const resultado = await this.salud.verificar();
    if (resultado.estado === 'error') respuesta.status(HttpStatus.SERVICE_UNAVAILABLE);
    return resultado;
  }
}
