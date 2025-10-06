-- AlterTable
ALTER TABLE "user_account" ADD COLUMN     "isSuperadmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTeacherActive" BOOLEAN NOT NULL DEFAULT false;
