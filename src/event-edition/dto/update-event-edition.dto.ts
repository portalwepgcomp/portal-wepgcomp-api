import { PartialType } from '@nestjs/swagger';
import { CreateEventEditionDto } from './create-event-edition.dto';
import {
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

function toOptionalCoordinate({
  value,
}: {
  value: unknown;
}): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return Number(value);
}

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
  @Transform(toOptionalCoordinate)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-90)
  @Max(90)
  locationLatitude?: number | null;

  @IsOptional()
  @Transform(toOptionalCoordinate)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(-180)
  @Max(180)
  locationLongitude?: number | null;

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
