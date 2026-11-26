import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Configuracion } from './configuracion';
import { asignarIdPeticion } from './comun/id-peticion';
import { FiltroErrores } from './comun/filtro-errores';
import { fabricarErrorDeValidacion } from './comun/errores-validacion';

// Compartida por main.ts y las pruebas e2e: así las pruebas ejercitan
// exactamente la misma configuración que producción.
export function configurarApp(app: NestExpressApplication, config: Configuracion): void {
  // Detrás de Caddy sin esto todas las peticiones llegan con la IP del proxy
  // y el limitador de intentos bloquearía a todos juntos.
  if (config.saltosProxy !== undefined) app.set('trust proxy', config.saltosProxy);
  app.use(helmet());
  app.use(cookieParser());
  app.use(asignarIdPeticion);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: fabricarErrorDeValidacion }));
  app.useGlobalFilters(new FiltroErrores());
  app.enableShutdownHooks();
}
