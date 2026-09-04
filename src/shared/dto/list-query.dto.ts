import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Parâmetros de consulta (Query Params) padrão para endpoints de listagem.
 *
 * Todos os campos são opcionais e retrocompatíveis:
 * - `search`: termo de busca textual (ex: título, nome, e-mail);
 * - `page`: número da página (base 1);
 * - `pageSize`: registros por página (padrão: 20);
 * - `paginated`: se true, envelopa a resposta em PaginatedResponseDto;
 * - `sortBy`: campo para ordenação;
 * - `sortOrder`: direção ('asc' ou 'desc').
 */
export class ListQueryDto {
  @ApiPropertyOptional({ description: 'Termo para busca textual' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Número da página (base 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Quantidade de registros por página', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: 'Define se o retorno deve ser envelopado com metadados de paginação' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  paginated?: boolean;

  @ApiPropertyOptional({ description: 'Campo pelo qual os registros devem ser ordenados' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Direção da ordenação', enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
