import { Module } from '@nestjs/common';
import { AccesoModule } from '../acceso/acceso.module';
import { EvidenciasModule } from '../evidencias/evidencias.module';
import { MallasController } from './mallas.controller';
import { MallasService } from './mallas.service';

@Module({ imports: [AccesoModule, EvidenciasModule], controllers: [MallasController], providers: [MallasService] })
export class MallasModule {}
