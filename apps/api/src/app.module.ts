import { Module } from '@nestjs/common';
import { ConfiguracionModule } from './configuracion.module';
import { PrismaModule } from './prisma/prisma.module';
import { SaludModule } from './salud/salud.module';

@Module({ imports: [ConfiguracionModule, PrismaModule, SaludModule] })
export class AppModule {}
