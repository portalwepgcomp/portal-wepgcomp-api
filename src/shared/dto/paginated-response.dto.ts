import { ApiProperty } from '@nestjs/swagger';

/**
 * Envelope padrão para respostas de listagem paginadas (P3.2).
 *
 * Padroniza respostas que retornam listas com metadados de paginação:
 * - `items`: registros da página atual;
 * - `total`: contagem total de itens disponíveis no banco de dados;
 * - `page`: página atual (base 1);
 * - `pageSize`: quantidade de itens por página;
 * - `totalPages`: total de páginas calculadas.
 *
 * Facilita a navegação paginada no frontend mantendo total compatibilidade.
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({
    isArray: true,
    description: 'Lista de registros da página atual',
  })
  items: T[];

  @ApiProperty({ description: 'Total geral de registros disponíveis' })
  total: number;

  @ApiProperty({ description: 'Número da página atual (iniciando em 1)' })
  page: number;

  @ApiProperty({ description: 'Quantidade de registros por página' })
  pageSize: number;

  @ApiProperty({ description: 'Quantidade total de páginas' })
  totalPages: number;

  constructor(
    items: T[],
    total: number,
    page: number = 1,
    pageSize: number = items.length || 10,
  ) {
    this.items = items;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
    this.totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  }

  /**
   * Método utilitário de fábrica para criar uma resposta paginada.
   */
  static create<T>(
    items: T[],
    total: number,
    page?: number,
    pageSize?: number,
  ): PaginatedResponseDto<T> {
    return new PaginatedResponseDto<T>(items, total, page, pageSize);
  }
}
