import { Module } from '@nestjs/common';
import { AccesoModule } from '../acceso/acceso.module';
import { EvidenciasModule } from '../evidencias/evidencias.module';
import { SesionesController } from './sesiones.controller';
import { SesionesService } from './sesiones.service';

@Module({ imports: [AccesoModule, EvidenciasModule], controllers: [SesionesController], providers: [SesionesService] })
export class SesionesModule {}
