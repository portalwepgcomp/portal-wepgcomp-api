/**
 * Ações que o usuário autenticado pode executar sobre um item de listagem.
 *
 * Calculado no service a partir de `req.user` (level + ownership), centralizando
 * regras que antes viviam no front (ex.: filtrar por `mainAuthorId` no cliente).
 */
export interface ListItemActions {
  canEdit: boolean;
  canDelete: boolean;
  canDownload?: boolean;
  canReorderPresentations?: boolean;
}
