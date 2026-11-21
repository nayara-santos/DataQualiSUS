import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const aparar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

/** A configuração é validada pelo esquema do catálogo (validarConfiguracaoRegra), não por decoradores. */
export class CriarRegraDto {
  @Transform(aparar)
  @IsString()
  @MinLength(1, { message: 'Informe o nome da regra.' })
  @MaxLength(200)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsObject({ message: 'Informe a configuração da regra.' })
  configuracao: Record<string, unknown>;
}

export class AtualizarRegraDto {
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsObject()
  configuracao?: Record<string, unknown>;
}

export class CriarConjuntoDto {
  @Transform(aparar)
  @IsString()
  @MinLength(1, { message: 'Informe o nome do conjunto.' })
  @MaxLength(200)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  /** Regras na ordem explícita de execução. */
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique({ message: 'A mesma regra foi incluída mais de uma vez.' })
  @IsUUID('all', { each: true })
  regras: string[];
}

export class AtualizarConjuntoDto {
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique({ message: 'A mesma regra foi incluída mais de uma vez.' })
  @IsUUID('all', { each: true })
  regras?: string[];
}
