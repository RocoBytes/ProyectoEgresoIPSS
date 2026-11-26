import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const MENSAJE_CORTO = 'Explica el motivo con al menos 10 caracteres.';

export class AnularRegistroDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  // Los decoradores se registran de abajo hacia arriba: un motivo ausente debe informar el mensaje de «corto», no el de «largo».
  @MaxLength(2000, { message: 'El motivo admite hasta 2.000 caracteres.' })
  @MinLength(10, { message: MENSAJE_CORTO })
  @IsString({ message: MENSAJE_CORTO })
  motivo!: string;
}
