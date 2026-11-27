import { Transform } from 'class-transformer';
import { IsUUID, Matches } from 'class-validator';
import { EsFechaTexto } from '../../comun/fecha-texto';

const MENSAJE_ANIO = 'Escribe el año con cuatro dígitos.';

/** Campo `datos` (JSON) de la subida de una versión de malla. */
export class DatosMallaDto {
  @IsUUID('all', { message: 'Selecciona la carrera.' })
  carreraId!: string;

  // El año llega como número o como texto: ambos se leen igual.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value))
  @Matches(/^\d{4}$/, { message: MENSAJE_ANIO })
  anio!: string;

  @EsFechaTexto({ message: 'Indica desde cuándo rige.' })
  vigenteDesde!: string;
}
