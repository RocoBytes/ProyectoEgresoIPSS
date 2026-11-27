import { Module } from '@nestjs/common';
import { ALMACENAMIENTO_EVIDENCIAS } from './almacenamiento';
import { DiscoLocal } from './disco-local';
import { EvidenciasController } from './evidencias.controller';
import { EvidenciasService } from './evidencias.service';
import { SubidaEvidenciaCierreInterceptor, SubidaEvidenciasInterceptor } from './subida-evidencias.interceptor';
import { ValidadorArchivos } from './validador-archivos';

@Module({
  controllers: [EvidenciasController],
  providers: [{ provide: ALMACENAMIENTO_EVIDENCIAS, useClass: DiscoLocal }, EvidenciasService, ValidadorArchivos, SubidaEvidenciasInterceptor, SubidaEvidenciaCierreInterceptor],
  exports: [ALMACENAMIENTO_EVIDENCIAS, ValidadorArchivos, SubidaEvidenciasInterceptor, SubidaEvidenciaCierreInterceptor],
})
export class EvidenciasModule {}
