import { Global, Module } from '@nestjs/common';
import { RELOJ, RelojSistema } from './reloj';

// Global para que cualquier módulo inyecte el reloj; las pruebas lo reemplazan con overrideProvider(RELOJ).
@Global()
@Module({ providers: [{ provide: RELOJ, useClass: RelojSistema }], exports: [RELOJ] })
export class ComunModule {}
