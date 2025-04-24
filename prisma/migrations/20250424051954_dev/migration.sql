/*
  Warnings:

  - The values [Admin,Librarian,Member] on the enum `RoleType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "RoleType_new" AS ENUM ('admin', 'librarian', 'member');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "RoleType_new" USING ("role"::text::"RoleType_new");
ALTER TYPE "RoleType" RENAME TO "RoleType_old";
ALTER TYPE "RoleType_new" RENAME TO "RoleType";
DROP TYPE "RoleType_old";
COMMIT;
