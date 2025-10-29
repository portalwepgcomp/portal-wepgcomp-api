/*
  Warnings:

  - The `subprofile` column on the `user_account` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "sub_profile" AS ENUM ('Doctorate', 'Master', 'Bachelor', 'Other');

-- AlterTable
ALTER TABLE "user_account" DROP COLUMN "subprofile",
ADD COLUMN     "subprofile" "sub_profile";
