/*
  Unifica o nível de permissão "Superadmin" em "Admin" e remove as flags
  redundantes `isAdmin` / `isSuperadmin`. A partir desta migration, `level`
  (`UserLevel`) é a única fonte de verdade para permissão administrativa:
  `Admin` | `Default`.

  Warnings:

  - Usuários com `level = 'Superadmin'` passam a ter `level = 'Admin'`.
  - As colunas `is_admin` e `is_superadmin` serão removidas.
*/

-- 1) Migrar dados de usuários Superadmin -> Admin ANTES de alterar o enum
UPDATE "user_account" SET "level" = 'Admin' WHERE "level" = 'Superadmin';

-- 2) Recriar enum sem Superadmin (Postgres não permite remover valor de enum)
ALTER TYPE "user_level" RENAME TO "user_level_old";
CREATE TYPE "user_level" AS ENUM ('Admin', 'Default');
ALTER TABLE "user_account"
  ALTER COLUMN "level" DROP DEFAULT,
  ALTER COLUMN "level" TYPE "user_level" USING ("level"::text::"user_level"),
  ALTER COLUMN "level" SET DEFAULT 'Default';
DROP TYPE "user_level_old";

-- 3) Remover flags redundantes (fonte de verdade única: "level")
ALTER TABLE "user_account" DROP COLUMN "is_admin";
ALTER TABLE "user_account" DROP COLUMN "is_superadmin";
