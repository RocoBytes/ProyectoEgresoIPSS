import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccesoController } from './acceso.controller';
import { AccesoService } from './acceso.service';
import { AlcanceService } from './alcance.service';
import { AutenticacionGuard } from './autenticacion.guard';
import { ContrasenasService } from './contrasenas.service';
import { IntentosDesconocidosService } from './intentos-desconocidos.service';
import { LimitePorIpGuard } from './limite-por-ip.guard';
import { RolesGuard } from './roles.guard';
import { TokensService } from './tokens.service';

@Module({
  // El límite por IP se aplica solo en /ingresar (con @UseGuards); estos valores son el respaldo del @Throttle de esa ruta.
  imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 15 * 60_000, limit: 20 }] })],
  controllers: [AccesoController],
  providers: [
    AccesoService,
    AlcanceService,
    ContrasenasService,
    TokensService,
    IntentosDesconocidosService,
    LimitePorIpGuard,
    // El orden de registro es el orden de ejecución: primero se identifica, después se autoriza.
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AlcanceService],
})
export class AccesoModule {}
