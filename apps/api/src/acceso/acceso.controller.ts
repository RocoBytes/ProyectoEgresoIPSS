import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { RespuestaCredencialesIncorrectas, RespuestaCuentaBloqueada, UsuarioActual as PerfilUsuario } from '@ipss/shared';
import { RELOJ, type Reloj } from '../comun/reloj';
import { AccesoService, type CredencialesDeSesion } from './acceso.service';
import { MENSAJE_SESION_INVALIDA } from './autenticacion.guard';
import { COOKIE_RENOVACION, borrarCookies, fijarCookieAcceso, fijarCookieRenovacion } from './cookies';
import { IngresarDto } from './dto/ingresar.dto';
import { LimitePorIpGuard } from './limite-por-ip.guard';
import { Publica, Roles, TODOS_LOS_ROLES } from './roles';
import { UsuarioActual, type UsuarioAutenticado } from './usuario-autenticado';

const LIMITE_POR_IP = 20;
const VENTANA_POR_IP_MS = 15 * 60_000;

function cookieDeRenovacion(peticion: Request): string | undefined {
  const valor = (peticion.cookies as Record<string, unknown> | undefined)?.[COOKIE_RENOVACION];
  return typeof valor === 'string' ? valor : undefined;
}

function fijarCookies(respuesta: Response, credenciales: CredencialesDeSesion): void {
  fijarCookieAcceso(respuesta, credenciales.jwt, credenciales.jwtSegundos);
  fijarCookieRenovacion(respuesta, credenciales.refresh, credenciales.refreshSegundos);
}

@Controller('acceso')
export class AccesoController {
  constructor(
    private readonly acceso: AccesoService,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  // Pública porque aún no hay sesión. El límite por IP corre antes que el cuerpo y protege la CPU del hash.
  @Publica()
  @UseGuards(LimitePorIpGuard)
  @Throttle({ default: { limit: LIMITE_POR_IP, ttl: VENTANA_POR_IP_MS } })
  @Post('ingresar')
  @HttpCode(HttpStatus.OK)
  async ingresar(@Body() cuerpo: IngresarDto, @Res({ passthrough: true }) respuesta: Response): Promise<PerfilUsuario> {
    const resultado = await this.acceso.ingresar(cuerpo.correo, cuerpo.contrasena);
    switch (resultado.tipo) {
      case 'ok':
        fijarCookies(respuesta, resultado.credenciales);
        return resultado.usuario;
      case 'credenciales': {
        const cuerpoError: RespuestaCredencialesIncorrectas = {
          statusCode: 401,
          message: 'Correo o contraseña incorrectos',
          intentosRestantes: resultado.intentosRestantes,
        };
        throw new UnauthorizedException(cuerpoError);
      }
      case 'bloqueada': {
        const segundos = Math.max(1, Math.ceil((resultado.bloqueadoHasta.getTime() - this.reloj.ahora().getTime()) / 1000));
        respuesta.setHeader('Retry-After', String(segundos));
        const cuerpoError: RespuestaCuentaBloqueada = {
          statusCode: 429,
          message: 'Cuenta bloqueada por intentos fallidos',
          bloqueadoHasta: resultado.bloqueadoHasta.toISOString(),
        };
        throw new HttpException(cuerpoError, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  // Pública: se llama cuando el JWT ya venció. Se autentica con la cookie de renovación (ADR 0009).
  @Publica()
  @Post('renovar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async renovar(@Req() peticion: Request, @Res({ passthrough: true }) respuesta: Response): Promise<void> {
    const resultado = await this.acceso.renovar(cookieDeRenovacion(peticion));
    // Al rechazar no se borran las cookies: dentro de la ventana de rotación la otra pestaña
    // ya dejó una cookie nueva válida, y borrarla cerraría una sesión legítima.
    if (resultado.tipo === 'rechazada') throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    fijarCookies(respuesta, resultado.credenciales);
  }

  // Pública: cerrar sesión con un JWT vencido tiene que funcionar igual.
  @Publica()
  @Post('salir')
  @HttpCode(HttpStatus.NO_CONTENT)
  async salir(@Req() peticion: Request, @Res({ passthrough: true }) respuesta: Response): Promise<void> {
    await this.acceso.salir(cookieDeRenovacion(peticion));
    borrarCookies(respuesta);
  }

  @Roles(...TODOS_LOS_ROLES)
  @Get('yo')
  async yo(@UsuarioActual() usuario: UsuarioAutenticado): Promise<PerfilUsuario> {
    const perfil = await this.acceso.perfil(usuario.id);
    // JWT válido de un usuario que ya no existe o fue desactivado: la sesión deja de servir.
    if (perfil === null) throw new UnauthorizedException(MENSAJE_SESION_INVALIDA);
    return perfil;
  }
}
