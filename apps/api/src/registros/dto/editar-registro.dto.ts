import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { EsFechaTexto } from '../../comun/fecha-texto';

export class EditarRegistroDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La descripción necesita al menos 20 caracteres.' })
  @MinLength(20, { message: 'La descripción necesita al menos 20 caracteres.' })
  @MaxLength(2000, { message: 'La descripción admite como máximo 2000 caracteres.' })
  descripcion?: string;

  @IsOptional()
  @EsFechaTexto({ message: 'Indica la fecha comprometida.' })
  fechaComprometida?: string;
}
