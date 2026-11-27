import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './app';
import { CONFIGURACION, type Configuracion } from './configuracion';

async function arrancar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<Configuracion>(CONFIGURACION);
  configurarApp(app, config);
  await app.listen(config.puerto, config.host);
  new Logger('Arranque').log(`API escuchando en http://${config.host}:${config.puerto}/api`);
}

void arrancar();
