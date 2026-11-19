import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class EntrarDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1, { message: 'Informe a senha.' })
  @MaxLength(200)
  senha: string;
}
