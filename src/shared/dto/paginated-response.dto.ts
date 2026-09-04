/**
 * Envelope padrão para respostas de listagem paginadas.
 *
 * Introduzido de forma aditiva: os endpoints atuais continuam retornando arrays
 * simples. Novos métodos `findListItems` podem optar por este envelope quando a
 * paginação server-side for necessária (ex.: quando as edições crescerem).
 */
export class PaginatedResponseDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;

  constructor(items: T[], total: number, page = 1, pageSize = items.length) {
    this.items = items;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }
}
