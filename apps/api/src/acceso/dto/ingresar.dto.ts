import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { ValidationArguments } from 'class-validator';

// Los textos son los del prototipo (pantalla de inicio de sesión).
const CORREO_VACIO = 'Escribe tu correo institucional.';
const CORREO_INCOMPLETO = 'El correo no está completo. Debe tener la forma nombre@dominio.';
const CLAVE_VACIA = 'Escribe tu contraseña.';

// Los decoradores se aplican de abajo hacia arriba y el filtro de errores informa la primera
// restricción que falla: por eso "vacío o mal formado" va al final (primero en evaluarse) y el largo arriba.
export class IngresarDto {
  // Se normaliza antes de validar: la columna es única y la base exige correos en minúsculas sin espacios,
  // así "Ana@x.cl " y "ana@x.cl" son la misma cuenta y comparten el contador de intentos.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(254, { message: 'El correo es demasiado largo.' })
  // Un solo validador con mensaje según el valor: así "vacío" y "mal formado" nunca salen juntos.
  @IsEmail({}, { message: (argumentos: ValidationArguments) => (argumentos.value === undefined || argumentos.value === '' ? CORREO_VACIO : CORREO_INCOMPLETO) })
  correo!: string;

  // El tope evita que una contraseña gigante convierta el hash en un vector de abuso de CPU.
  @MaxLength(256, { message: 'La contraseña es demasiado larga.' })
  @MinLength(1, { message: CLAVE_VACIA })
  @IsString({ message: CLAVE_VACIA })
  contrasena!: string;
}
