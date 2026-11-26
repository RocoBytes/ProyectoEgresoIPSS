import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

// Parámetros por defecto de la librería (m=64 MiB, t=3, p=4), explícitos solo en el algoritmo.
// El hash ficticio usa los mismos, así que verificarlo cuesta lo mismo que verificar uno real.
const OPCIONES = { type: argon2.argon2id } as const;

@Injectable()
export class ContrasenasService implements OnModuleInit {
  private hashFicticio = '';

  // Se calcula al arrancar y no se escribe a mano: así sigue el costo real si cambian los parámetros.
  async onModuleInit(): Promise<void> {
    this.hashFicticio = await argon2.hash(randomUUID(), OPCIONES);
  }

  hashear(contrasena: string): Promise<string> {
    return argon2.hash(contrasena, OPCIONES);
  }

  async verificar(hash: string, contrasena: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, contrasena);
    } catch {
      // Un hash mal formado (dato corrupto) no debe tumbar el ingreso: cuenta como contraseña incorrecta.
      return false;
    }
  }

  /**
   * Se llama cuando el correo no existe, para gastar el mismo tiempo que una verificación real:
   * si no, la diferencia de latencia revelaría qué correos tienen cuenta. Siempre devuelve false.
   */
  async verificarContraFicticio(contrasena: string): Promise<false> {
    await this.verificar(this.hashFicticio, contrasena);
    return false;
  }
}
