// Prueba de humo: NestJS + Multer + file-type + argon2 + throttler + helmet sobre Node.js 26.
import 'reflect-metadata';
import {
  BadRequestException, Body, Controller, Get, HttpCode, Injectable, Module, Post, Req, Res,
  UnauthorizedException, UploadedFile, UseGuards, UseInterceptors, ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileInterceptor, NestExpressApplication } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import * as argon2 from 'argon2';
import { fileTypeFromBuffer } from 'file-type';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request, Response } from 'express';

const DIRECTORIO = process.env.DIRECTORIO_EVIDENCIAS ?? '/tmp/evidencias-spike';
const PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png']);

class LoginDto {
  @IsEmail() correo!: string;
  @IsString() @MinLength(8) contrasena!: string;
}

@Injectable()
class HashService {
  private hash?: string;
  async verificar(contrasena: string): Promise<boolean> {
    this.hash ??= await argon2.hash('Clave-de-prueba-2026', { type: argon2.argon2id });
    return argon2.verify(this.hash, contrasena);
  }
}

@Controller()
class SpikeController {
  // La inyección por tipo depende de emitDecoratorMetadata: si el compilador no la emite, esto falla al arrancar
  constructor(private readonly hashes: HashService) {}

  @Get('ip')
  ip(@Req() req: Request) {
    return { ip: req.ip, ips: req.ips, xff: req.headers['x-forwarded-for'] ?? null };
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    if (!(await this.hashes.verificar(dto.contrasena))) throw new UnauthorizedException('Credenciales inválidas');
    res.cookie('sesion', 'jwt-de-prueba', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 15 * 60_000 });
    return { ok: true };
  }

  @Post('evidencias')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  async subir(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException('Falta el archivo');
    const tipo = await fileTypeFromBuffer(archivo.buffer);
    if (!tipo || !PERMITIDOS.has(tipo.mime)) {
      throw new BadRequestException(`Tipo no permitido: ${tipo?.mime ?? 'desconocido'} (declarado: ${archivo.mimetype})`);
    }
    const id = randomUUID();
    await mkdir(DIRECTORIO, { recursive: true });
    await writeFile(join(DIRECTORIO, id), archivo.buffer, { flag: 'wx' });
    return {
      id,
      mime: tipo.mime,
      tamano: archivo.size,
      sha256: createHash('sha256').update(archivo.buffer).digest('hex'),
      nombreRecibido: archivo.originalname,
      nombreCorregido: Buffer.from(archivo.originalname, 'latin1').toString('utf8'),
    };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
  controllers: [SpikeController],
  providers: [HashService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? 3900), '127.0.0.1');
  console.log(`listo en ${process.env.PORT ?? 3900} con Node ${process.version}`);
}
void bootstrap();
