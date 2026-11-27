import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

export const MENSAJE_LIMITE_POR_IP = 'Demasiados intentos desde esta conexión. Espera unos minutos.';

// Se distingue a propósito del bloqueo de cuenta: este límite es por IP y no revela nada de ningún correo.
@Injectable()
export class LimitePorIpGuard extends ThrottlerGuard {
  protected override getErrorMessage(): Promise<string> {
    return Promise.resolve(MENSAJE_LIMITE_POR_IP);
  }
}
