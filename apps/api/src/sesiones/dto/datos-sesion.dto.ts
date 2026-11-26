import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsString, IsUUID, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import type { NivelImpacto } from '@ipss/shared';
import { EsFechaTexto } from '../../comun/fecha-texto';

export const NIVELES: readonly NivelImpacto[] = ['RECURSO', 'ASIGNATURA', 'MODULO', 'MALLA', 'PERFIL_INGRESO', 'PERFIL_EGRESO'];

const conAsignatura = (r: RegistroDto): boolean => r.nivelImpacto === 'RECURSO' || r.nivelImpacto === 'ASIGNATURA' || r.nivelImpacto === 'MODULO';

// Cada propiedad repite su mensaje en todos sus decoradores: el aplanador de errores toma el primero y no importa cuál falle.
export class RegistroDto {
  @IsUUID('all', { message: 'Selecciona la carrera.' })
  carreraId!: string;

  @IsIn(NIVELES, { message: 'Selecciona el nivel de impacto.' })
  nivelImpacto!: NivelImpacto;

  @ValidateIf(conAsignatura)
  @IsUUID('all', { message: (a) => ((a.object as RegistroDto).nivelImpacto === 'MODULO' ? 'Selecciona el módulo.' : 'Selecciona la asignatura.') })
  asignaturaId?: string;

  @ValidateIf((r: RegistroDto) => r.nivelImpacto === 'MALLA')
  @IsUUID('all', { message: 'Selecciona la versión de malla.' })
  versionMallaId?: string;

  @ValidateIf((r: RegistroDto) => r.nivelImpacto === 'RECURSO')
  @IsString({ message: 'Indica qué recurso se ve afectado.' })
  @MinLength(3, { message: 'Indica qué recurso se ve afectado.' })
  recurso?: string;

  @IsString({ message: 'Describe lo observado con al menos 20 caracteres.' })
  @MinLength(20, { message: 'Describe lo observado con al menos 20 caracteres.' })
  descripcion!: string;

  @EsFechaTexto({ message: 'Indica la fecha comprometida.' })
  fechaComprometida!: string;
}

export class DatosSesionDto {
  @IsUUID('all', { message: 'Selecciona el canal por el que llegó la retroalimentación.' })
  canalId!: string;

  @EsFechaTexto({ message: 'Indica la fecha de la sesión.' })
  fecha!: string;

  @IsString({ message: 'Escribe el nombre de la instancia.' })
  @MinLength(5, { message: 'Escribe el nombre de la instancia.' })
  instancia!: string;

  @IsArray({ message: 'Anota al menos un participante.' })
  @ArrayMinSize(1, { message: 'Anota al menos un participante.' })
  @IsString({ each: true, message: 'Anota al menos un participante.' })
  participantes!: string[];

  @IsArray({ message: 'Agrega al menos un registro.' })
  @ArrayMinSize(1, { message: 'Agrega al menos un registro.' })
  @ValidateNested({ each: true })
  @Type(() => RegistroDto)
  registros!: RegistroDto[];
}

