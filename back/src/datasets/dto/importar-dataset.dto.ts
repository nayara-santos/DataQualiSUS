import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SeparadorCsv } from '../limites-csv';

const aparar = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class ImportarDatasetDto {
  @Transform(aparar)
  @IsString()
  @MinLength(1, { message: 'Informe o nome do dataset.' })
  @MaxLength(200)
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsEnum(SeparadorCsv, { message: 'Separador deve ser VIRGULA ou PONTO_E_VIRGULA.' })
  separador?: SeparadorCsv;
}

export class NovaVersaoDto {
  @IsOptional()
  @IsEnum(SeparadorCsv, { message: 'Separador deve ser VIRGULA ou PONTO_E_VIRGULA.' })
  separador?: SeparadorCsv;
}
