import { Injectable } from '@nestjs/common';

// Toda regla que depende de la hora (vencimientos, bloqueos, ventanas de rotación) pregunta
// aquí y no a `new Date()`: así las pruebas controlan el tiempo sin esperar ni falsear globales.
export interface Reloj {
  ahora(): Date;
}

export const RELOJ = Symbol('RELOJ');

@Injectable()
export class RelojSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}
