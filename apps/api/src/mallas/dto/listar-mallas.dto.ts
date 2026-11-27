import { IsUUID } from 'class-validator';

export class ListarMallasDto {
  @IsUUID('all', { message: 'La carrera no es válida.' })
  carreraId!: string;
}
