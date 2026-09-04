import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query params comuns a endpoints de listagem.
 *
 * Todos os campos são OPCIONAIS e retrocompatíveis: endpoints que passam a
 * aceitar esta DTO continuam funcionando para clientes que não enviam nada.
 */
export class ListQueryDto {
  /** Busca textual (o service decide em quais campos aplicar o OR). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
