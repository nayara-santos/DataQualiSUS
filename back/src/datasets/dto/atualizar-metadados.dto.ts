import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const aparar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/** Edição de metadados é distinta da edição de conteúdo (RN04): só nome e descrição. */
export class AtualizarMetadadosDto {
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MinLength(1, { message: 'O nome não pode ficar vazio.' })
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;
}

export class PaginacaoRegistrosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  tamanho: number = 20;
}
