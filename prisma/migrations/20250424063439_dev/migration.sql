-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('admin', 'librarian', 'member');

-- CreateEnum
CREATE TYPE "BorrowStatus" AS ENUM ('borrowed', 'returned', 'overdue');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'resolved');

-- CreateTable
CREATE TABLE "libraries" (
    "library_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "libraries_pkey" PRIMARY KEY ("library_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "library_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "RoleType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "borrowed_book_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "reserved_book_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "wishlist_book_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "genres" (
    "genre_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("genre_id")
);

-- CreateTable
CREATE TABLE "authors" (
    "author_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "book_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("author_id")
);

-- CreateTable
CREATE TABLE "books" (
    "book_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "library_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "isbn" TEXT,
    "description" TEXT,
    "total_copies" INTEGER NOT NULL DEFAULT 1,
    "available_copies" INTEGER NOT NULL DEFAULT 1,
    "reserved_copies" INTEGER NOT NULL DEFAULT 0,
    "author_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "genre_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "published_date" TIMESTAMPTZ(6),
    "added_on" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "cover_image_url" TEXT,

    CONSTRAINT "books_pkey" PRIMARY KEY ("book_id")
);

-- CreateTable
CREATE TABLE "policies" (
    "policy_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "library_id" UUID NOT NULL,
    "max_borrow_days" INTEGER NOT NULL,
    "fine_per_day" DECIMAL(6,2) NOT NULL,
    "max_books_per_user" INTEGER NOT NULL,
    "reservation_expiry_days" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("policy_id")
);

-- CreateTable
CREATE TABLE "borrow_transactions" (
    "borrow_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "borrow_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "return_date" TIMESTAMPTZ(6),
    "status" "BorrowStatus" NOT NULL DEFAULT 'borrowed',

    CONSTRAINT "borrow_transactions_pkey" PRIMARY KEY ("borrow_id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "reservation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "reserved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "wishlist_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("wishlist_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "review_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "ticket_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "resolved_by" UUID,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("ticket_id")
);

-- CreateTable
CREATE TABLE "fines" (
    "fine_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "borrow_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "library_id" UUID NOT NULL,
    "amount" DECIMAL(8,2) NOT NULL,
    "reason" TEXT,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "fine_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fines_pkey" PRIMARY KEY ("fine_id")
);

-- CreateTable
CREATE TABLE "document_uploads" (
    "upload_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "book_id" UUID,
    "library_id" UUID NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_uploads_pkey" PRIMARY KEY ("upload_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_user_id_book_id_key" ON "wishlists"("user_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "fines_borrow_id_key" ON "fines"("borrow_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("library_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("library_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("library_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_transactions" ADD CONSTRAINT "borrow_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrow_transactions" ADD CONSTRAINT "borrow_transactions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("book_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("book_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("book_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("book_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_borrow_id_fkey" FOREIGN KEY ("borrow_id") REFERENCES "borrow_transactions"("borrow_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("book_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("library_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("book_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("library_id") ON DELETE CASCADE ON UPDATE CASCADE;
