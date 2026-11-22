import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Profile, UserLevel } from '@prisma/client';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ListQueryDto } from '../../shared/dto/list-query.dto';

export const ERROR_LOG_SOURCES = ['http', 'logger', 'cron', 'process'] as const;
export const ERROR_LOG_LEVELS = ['error', 'warn'] as const;
export const ERROR_LOG_STATUS_CLASSES = ['4xx', '5xx'] as const;
export const ERROR_LOG_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const;
export const ERROR_LOG_SORT_FIELDS = [
  'createdAt',
  'statusCode',
  'userEmail',
  'exceptionName',
  'route',
] as const;
export const ERROR_LOG_GROUP_BY_FIELDS = [
  'statusCode',
  'exceptionName',
  'route',
  'userEmail',
  'source',
  'prismaCode',
  'loggerContext',
  'day',
] as const;
export const ERROR_LOG_MAX_PAGE_SIZE = 100;

export type ErrorLogSortField = (typeof ERROR_LOG_SORT_FIELDS)[number];
export type ErrorLogGroupByField = (typeof ERROR_LOG_GROUP_BY_FIELDS)[number];
export type ErrorLogStatusClass = (typeof ERROR_LOG_STATUS_CLASSES)[number];

/** Aceita `a,b,c` ou parâmetro repetido (`?x=a&x=b`). */
function toStringList({ value }: TransformFnParams): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw: unknown[] = Array.isArray(value)
    ? value
    : String(value).split(',');
  const list = raw.map((item) => String(item).trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

function toUpperStringList(params: TransformFnParams): string[] | undefined {
  return toStringList(params)?.map((item) => item.toUpperCase());
}

function toNumberList(params: TransformFnParams): number[] | undefined {
  return toStringList(params)?.map(Number);
}

function toBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true' || value === true) {
    return true;
  }
  if (value === 'false' || value === false) {
    return false;
  }
  return value;
}

@ValidatorConstraint({ name: 'isNotBeforeFrom' })
class IsNotBeforeFromConstraint implements ValidatorConstraintInterface {
  validate(to: string, args: ValidationArguments): boolean {
    const { from } = args.object as { from?: string };
    if (!from || !to) {
      return true;
    }
    return new Date(to).getTime() >= new Date(from).getTime();
  }

  defaultMessage(): string {
    return '`to` deve ser maior ou igual a `from`.';
  }
}

export class ErrorLogQueryDto extends ListQueryDto {
  @ApiPropertyOptional({
    description: 'Registros por página (máximo 100)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ERROR_LOG_MAX_PAGE_SIZE)
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: ERROR_LOG_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(ERROR_LOG_SORT_FIELDS)
  sortBy?: ErrorLogSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Contém, sem diferenciar maiúsculas (ex.: @ufba.br)',
  })
  @IsOptional()
  @IsString()
  userEmail?: string;

  @ApiPropertyOptional({ description: 'Contém, sem diferenciar maiúsculas' })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Lista separada por vírgula',
    enum: UserLevel,
    isArray: true,
  })
  @IsOptional()
  @Transform(toStringList)
  @IsEnum(UserLevel, { each: true })
  userLevel?: UserLevel[];

  @ApiPropertyOptional({
    description: 'Lista separada por vírgula',
    enum: Profile,
    isArray: true,
  })
  @IsOptional()
  @Transform(toStringList)
  @IsEnum(Profile, { each: true })
  userProfile?: Profile[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isAuthenticated?: boolean;

  @ApiPropertyOptional({
    description:
      'Início (ISO 8601). Sem `from` e `to`, o padrão são os últimos 7 dias.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fim (ISO 8601), maior ou igual a `from`',
  })
  @IsOptional()
  @IsDateString()
  @Validate(IsNotBeforeFromConstraint)
  to?: string;

  @ApiPropertyOptional({ enum: ERROR_LOG_SOURCES, isArray: true })
  @IsOptional()
  @Transform(toStringList)
  @IsIn(ERROR_LOG_SOURCES, { each: true })
  source?: string[];

  @ApiPropertyOptional({ enum: ERROR_LOG_LEVELS, isArray: true })
  @IsOptional()
  @Transform(toStringList)
  @IsIn(ERROR_LOG_LEVELS, { each: true })
  level?: string[];

  @ApiPropertyOptional({
    description: 'Códigos exatos, separados por vírgula',
    type: [Number],
  })
  @IsOptional()
  @Transform(toNumberList)
  @IsInt({ each: true })
  @Min(100, { each: true })
  @Max(599, { each: true })
  statusCode?: number[];

  @ApiPropertyOptional({ enum: ERROR_LOG_STATUS_CLASSES, isArray: true })
  @IsOptional()
  @Transform(toStringList)
  @IsIn(ERROR_LOG_STATUS_CLASSES, { each: true })
  statusClass?: ErrorLogStatusClass[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(toStringList)
  @IsString({ each: true })
  exceptionName?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Ex.: P2002' })
  @IsOptional()
  @Transform(toStringList)
  @IsString({ each: true })
  prismaCode?: string[];

  @ApiPropertyOptional({ description: 'Contém, sem diferenciar maiúsculas' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ enum: ERROR_LOG_METHODS, isArray: true })
  @IsOptional()
  @Transform(toUpperStringList)
  @IsIn(ERROR_LOG_METHODS, { each: true })
  method?: string[];

  @ApiPropertyOptional({ description: 'Contém (ex.: /submission)' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({
    description: 'Padrão exato da rota (ex.: /submission/:id)',
  })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Ex.: MailingService, Scheduler',
  })
  @IsOptional()
  @Transform(toStringList)
  @IsString({ each: true })
  loggerContext?: string[];

  @ApiPropertyOptional({ description: 'Contém (ex.: certificate.service)' })
  @IsOptional()
  @IsString()
  file?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
}

export class ErrorLogSummaryQueryDto extends ErrorLogQueryDto {
  @ApiProperty({ enum: ERROR_LOG_GROUP_BY_FIELDS })
  @IsIn(ERROR_LOG_GROUP_BY_FIELDS)
  groupBy: ErrorLogGroupByField;
}
