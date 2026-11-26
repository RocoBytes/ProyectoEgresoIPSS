import { Module } from '@nestjs/common';
import { AccesoModule } from '../acceso/acceso.module';
import { RegistrosController } from './registros.controller';
import { RegistrosService } from './registros.service';

@Module({ imports: [AccesoModule], controllers: [RegistrosController], providers: [RegistrosService] })
export class RegistrosModule {}
