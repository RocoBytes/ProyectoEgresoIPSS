import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { EsFechaTexto } from '../../comun/fecha-texto';

const MENSAJE_FECHA = 'Indica la fecha en que el cambio se hizo efectivo.';
const MENSAJE_COMENTARIO = 'El comentario admite hasta 2.000 caracteres.';

/** Campo `datos` (JSON) del cierre; la evidencia viaja aparte como archivo. */
export class CerrarRegistroDto {
  @EsFechaTexto({ message: MENSAJE_FECHA })
  fechaEfectiva!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: MENSAJE_COMENTARIO })
  @MaxLength(2000, { message: MENSAJE_COMENTARIO })
  comentario?: string;
}
