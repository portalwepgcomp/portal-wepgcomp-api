-- CreateEnum
CREATE TYPE "RegistrationNumberType" AS ENUM ('CPF', 'MATRICULA');

-- AlterTable
ALTER TABLE "user_account" ADD COLUMN     "registration_number_type" "RegistrationNumberType";
