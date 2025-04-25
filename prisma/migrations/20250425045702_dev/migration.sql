-- AlterTable
ALTER TABLE "users" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "phone_number" TEXT;
