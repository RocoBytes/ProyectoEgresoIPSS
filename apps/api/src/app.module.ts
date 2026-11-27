import { Module } from '@nestjs/common';
import { AccesoModule } from './acceso/acceso.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { ComunModule } from './comun/comun.module';
import { ConfiguracionModule } from './configuracion.module';
import { EvidenciasModule } from './evidencias/evidencias.module';
import { MallasModule } from './mallas/mallas.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistrosModule } from './registros/registros.module';
import { ReportesModule } from './reportes/reportes.module';
import { SaludModule } from './salud/salud.module';
import { SesionesModule } from './sesiones/sesiones.module';

@Module({ imports: [ConfiguracionModule, ComunModule, PrismaModule, AccesoModule, CatalogosModule, EvidenciasModule, SesionesModule, RegistrosModule, MallasModule, ReportesModule, SaludModule] })
export class AppModule {}
