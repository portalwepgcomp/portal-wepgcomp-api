import {
  IsString,
  IsBoolean,
  IsInt,
  IsOptional,
  MaxLength,
  IsISO8601,
  Min,
  Max,
  IsUUID,
  IsArray,
  IsNumber,
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
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return parsed;
  return Number(parsed.toFixed(8));
}

export class CreateEventEditionDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  callForPapersText?: string;

  @IsString()
  @IsOptional()
  partnersText?: string;

  @IsString()
  @MaxLength(255)
  location: string;

  @IsOptional()
  @Transform(toOptionalCoordinate)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLatitude?: number | null;

  @IsOptional()
  @Transform(toOptionalCoordinate)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLongitude?: number | null;

  @IsISO8601()
  startDate: Date;

  @IsISO8601()
  endDate: Date;

  @IsISO8601()
  @IsOptional()
  submissionStartDate?: Date;

  @IsISO8601()
  submissionDeadline: Date;

  @IsOptional()
  @IsBoolean()
  isEvaluationRestrictToLoggedUsers?: boolean;

  @IsInt()
  @Min(1)
  presentationDuration: number;

  @IsInt()
  @Min(1)
  presentationsPerPresentationBlock: number;

  @IsUUID()
  @IsOptional()
  coordinatorId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roomName?: string[];
}

export class CreateFromEventEditionFormDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  description: string;

  @IsISO8601()
  startDate: Date;

  @IsISO8601()
  endDate: Date;

  @IsString()
  @MaxLength(255)
  location: string;

  @IsOptional()
  @Transform(toOptionalCoordinate)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLatitude?: number | null;

  @IsOptional()
  @Transform(toOptionalCoordinate)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLongitude?: number | null;

  @IsUUID()
  @IsOptional()
  coordinatorId?: string;

  @IsOptional()
  organizingCommitteeIds: Array<string>;

  @IsOptional()
  itSupportIds: Array<string>;

  @IsOptional()
  administrativeSupportIds: Array<string>;

  @IsOptional()
  communicationIds: Array<string>;

  @IsInt()
  @Min(1)
  presentationsPerPresentationBlock: number;

  @IsInt()
  @Min(1)
  presentationDuration: number;

  @IsString()
  @IsOptional()
  callForPapersText?: string;

  @IsISO8601()
  submissionDeadline: Date;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roomName?: string[];
}
