import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * Campos que o próprio usuário pode alterar no seu perfil (whitelist).
 * Campos sensíveis (email, level, profile, flags de ativação/aprovação
 * etc.) não existem aqui de propósito: o ValidationPipe global
 * descarta tudo que não estiver declarado.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Maria da Silva', maxLength: 255 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Link do Lattes. String vazia remove o link.',
    example: 'http://lattes.cnpq.br/1234567890123456',
    maxLength: 50,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  linkLattes?: string;

  @ApiPropertyOptional({
    description:
      'Matrícula (ou CPF para ouvinte "Outro"); pontuação é ignorada. Para apresentador/professor aprovado, exige nova aprovação.',
    example: '2021001',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @IsString()
  @MaxLength(20)
  registrationNumber?: string;
}
