import { Module } from '@nestjs/common';
import { AccesoModule } from './acceso/acceso.module';
import { ComunModule } from './comun/comun.module';
import { ConfiguracionModule } from './configuracion.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';

@Module({ imports: [ConfiguracionModule, ComunModule, PrismaModule, AccesoModule, SaludModule] })
export class AppModule {}
