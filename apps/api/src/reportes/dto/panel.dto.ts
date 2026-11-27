import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// Un filtro vacío equivale a no filtrar.
const vacioEsAusente = Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value));

export class PanelDto {
  @IsOptional() @vacioEsAusente @Type(() => Number) @IsInt({ message: 'El año no es válido.' }) @Min(2000, { message: 'El año no es válido.' }) @Max(2100, { message: 'El año no es válido.' })
  anio?: number;

  @IsOptional() @vacioEsAusente @IsUUID('all', { message: 'El sector no es válido.' })
  sectorId?: string;

  @IsOptional() @vacioEsAusente @IsUUID('all', { message: 'La carrera no es válida.' })
  carreraId?: string;
}
