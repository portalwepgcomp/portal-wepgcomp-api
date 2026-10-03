import { PartialType } from '@nestjs/swagger';
import { CreateEventEditionDto } from './create-event-edition.dto';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  IsArray,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateEventEditionDto extends PartialType(CreateEventEditionDto) {}

export class UpdateFromEventEditionFormDto {
  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsISO8601()
  @IsOptional()
  startDate?: Date;

  @IsISO8601()
  @IsOptional()
  endDate?: Date;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  location?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(8000)
  @Matches(/https:\/\/www\.google\.com\/maps\/embed/i, {
    message: 'Informe o link de incorporar o mapa do Google',
  })
  mapEmbedUrl?: string | null;

  @IsUUID()
  @IsOptional()
  coordinatorId?: string;

  @IsOptional()
  organizingCommitteeIds?: Array<string>;

  @IsOptional()
  itSupportIds?: Array<string>;

  @IsOptional()
  administrativeSupportIds?: Array<string>;

  @IsOptional()
  communicationIds?: Array<string>;

  @IsInt()
  @Min(1)
  @IsOptional()
  presentationsPerPresentationBlock?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  presentationDuration?: number;

  @IsString()
  @IsOptional()
  callForPapersText?: string;

  @IsISO8601()
  @IsOptional()
  submissionDeadline?: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roomName?: string[];
}
