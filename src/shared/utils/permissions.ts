import { UserLevel } from '@prisma/client';

/** Formato mínimo do usuário autenticado disponível em `req.user` (JWT). */
export interface RequestingUser {
  userId: string;
  level: UserLevel;
}

/** Admin tem acesso privilegiado (não restrito a ownership). */
export function isPrivileged(level?: UserLevel): boolean {
  return level === UserLevel.Admin;
}

/**
 * Pode gerenciar (editar/excluir) um recurso próprio; se privilegiado, qualquer
 * recurso. Usuário `Default` só gerencia o que é seu.
 */
export function canManageOwned(
  user: RequestingUser | undefined,
  ownerId: string,
): boolean {
  if (!user) return false;
  return isPrivileged(user.level) || user.userId === ownerId;
}
