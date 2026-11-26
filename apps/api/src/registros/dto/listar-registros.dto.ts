import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { FiltroEstado, NivelImpacto } from '@ipss/shared';
import { NIVELES } from '../../sesiones/dto/datos-sesion.dto';

export const ESTADOS_FILTRO: readonly FiltroEstado[] = ['ABIERTO', 'VENCIDO', 'CERRADO', 'ANULADO'];

// Un filtro vacío (`?q=`) equivale a no filtrar.
const vacioEsAusente = Transform(({ value }: { value: unknown }) => (value === '' ? undefined : value));

export class ListarRegistrosDto {
  @IsOptional() @vacioEsAusente @Type(() => Number) @IsInt({ message: 'El año no es válido.' }) @Min(2000, { message: 'El año no es válido.' }) @Max(2100, { message: 'El año no es válido.' })
  anio?: number;

  @IsOptional() @vacioEsAusente @IsUUID('all', { message: 'El sector no es válido.' })
  sectorId?: string;

  @IsOptional() @vacioEsAusente @IsUUID('all', { message: 'La carrera no es válida.' })
  carreraId?: string;

  @IsOptional() @vacioEsAusente @IsUUID('all', { message: 'La asignatura no es válida.' })
  asignaturaId?: string;

  @IsOptional() @vacioEsAusente @IsUUID('all', { message: 'El canal no es válido.' })
  canalId?: string;

  @IsOptional() @vacioEsAusente @IsIn(NIVELES, { message: 'El nivel de impacto no es válido.' })
  nivel?: NivelImpacto;

  @IsOptional() @vacioEsAusente @IsIn(ESTADOS_FILTRO, { message: 'El estado no es válido.' })
  estado?: FiltroEstado;

  @IsOptional() @vacioEsAusente @IsString({ message: 'La búsqueda no es válida.' }) @MaxLength(100, { message: 'La búsqueda es demasiado larga.' })
  q?: string;

  @IsOptional() @vacioEsAusente @Type(() => Number) @IsInt({ message: 'La página no es válida.' }) @Min(1, { message: 'La página no es válida.' })
  pagina?: number;
}
