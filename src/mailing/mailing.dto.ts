import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DefaultEmailDto {
  from: string;
  @IsEmail()
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class DefaultEmailResponseDto {
  message: string;
}

export class ContactRequestDto {
  @IsString({ message: 'O nome deve ser uma string' })
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  name: string;

  @IsEmail()
  email: string;

  @IsString({ message: 'A mensagem deve ser uma string' })
  @IsNotEmpty({ message: 'A mensagem é obrigatória' })
  text: string;
}

export class ContactResponseDto {
  message: string;
}
export class EmailFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profiles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subprofiles?: string[];
}

export class SendGroupEmailDto {
  @IsString({ message: 'O assunto deve ser uma string' })
  @IsNotEmpty({ message: 'O assunto é obrigatório' })
  subject: string;

  @IsString({ message: 'A mensagem deve ser uma string' })
  @IsNotEmpty({ message: 'A mensagem é obrigatória' })
  message: string;

  @IsObject()
  @ValidateNested()
  @Type(() => EmailFiltersDto)
  filters: EmailFiltersDto;
}
