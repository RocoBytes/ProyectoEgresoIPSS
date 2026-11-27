import { Global, Module } from '@nestjs/common';
import { CONFIGURACION, cargarConfiguracion } from './configuracion';

// Global para que cualquier módulo inyecte la configuración sin importarlo.
// Las pruebas la reemplazan con overrideProvider(CONFIGURACION).
@Global()
@Module({
  providers: [{ provide: CONFIGURACION, useFactory: () => cargarConfiguracion(process.env) }],
  exports: [CONFIGURACION],
})
export class ConfiguracionModule {}
