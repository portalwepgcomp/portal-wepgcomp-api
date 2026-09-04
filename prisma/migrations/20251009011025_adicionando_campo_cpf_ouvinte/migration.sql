/*
  Warnings:

  - You are about to drop the column `isAdmin` on the `user_account` table. All the data in the column will be lost.
  - You are about to drop the column `isSuperadmin` on the `user_account` table. All the data in the column will be lost.
  - You are about to drop the column `isTeacherActive` on the `user_account` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_account" DROP COLUMN "isAdmin",
DROP COLUMN "isSuperadmin",
DROP COLUMN "isTeacherActive",
ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_superadmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_teacher_active" BOOLEAN NOT NULL DEFAULT false;
