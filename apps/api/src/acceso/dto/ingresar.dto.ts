import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class IngresarDto {
  // Se normaliza antes de validar: la columna es única y la base exige correos en minúsculas sin espacios,
  // así "Ana@x.cl " y "ana@x.cl" son la misma cuenta y comparten el contador de intentos.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  // El tope evita que una contraseña gigante convierta el hash en un vector de abuso de CPU.
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  contrasena!: string;
}
