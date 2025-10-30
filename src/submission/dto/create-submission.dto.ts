import { SubmissionStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSubmissionDto {
  @IsUUID()
  advisorId: string;

  @IsUUID()
  mainAuthorId: string;

  @IsUUID()
  eventEditionId: string;

  @IsString()
  @MinLength(5, { message: 'O título deve ter pelo menos 5 caracteres.' })
  title: string;

  @IsString()
  @MinLength(10, { message: 'O abstract deve ter pelo menos 10 caracteres.' })
  abstractText: string;

  @IsString()
  pdfFile: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsUUID()
  @IsOptional()
  proposedPresentationBlockId?: string;

  @IsInt({
    message: 'A posição da apresentação deve ser um número inteiro.',
  })
  @Min(0, {
    message: 'A posição da apresentação deve ser um número não negativo.',
  })
  @IsOptional()
  proposedPositionWithinBlock?: number;

  @IsEnum(SubmissionStatus)
  @IsOptional()
  status?: SubmissionStatus;

  @IsString()
  @IsOptional()
  coAdvisor?: string;

  @IsString()
  @IsOptional()
  linkHostedFile?: string;
}
