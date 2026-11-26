import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { EsFechaTexto } from '../../comun/fecha-texto';

export class EditarRegistroDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'La descripción necesita al menos 20 caracteres.' })
  @MinLength(20, { message: 'La descripción necesita al menos 20 caracteres.' })
  descripcion?: string;

  @IsOptional()
  @EsFechaTexto({ message: 'Indica la fecha comprometida.' })
  fechaComprometida?: string;
}
