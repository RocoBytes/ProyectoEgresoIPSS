import { Module } from '@nestjs/common';
import { AccesoModule } from '../acceso/acceso.module';
import { EvidenciasModule } from '../evidencias/evidencias.module';
import { CierreAnulacionService } from './cierre-anulacion.service';
import { ExportacionRegistrosService } from './exportacion-registros.service';
import { RegistrosController } from './registros.controller';
import { RegistrosService } from './registros.service';

@Module({ imports: [AccesoModule, EvidenciasModule], controllers: [RegistrosController], providers: [RegistrosService, CierreAnulacionService, ExportacionRegistrosService] })
export class RegistrosModule {}
