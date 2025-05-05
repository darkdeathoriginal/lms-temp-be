// src/controllers/book.controller.js
const { Prisma } = require('@prisma/client');
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

// --- Validation Helper ---
// Throws an error if counts are invalid, otherwise returns true.
const validateBookCounts = (data, currentTotal = null) => {
     // Use provided values or default to 0 if null/undefined
     const total = data.total_copies ?? currentTotal ?? 0; // Use current total if updating and not provided
     const available = data.available_copies ?? 0;
     const reserved = data.reserved_copies ?? 0;

     // Basic non-negativity checks
     if (total < 0 || available < 0 || reserved < 0) {
        throw new Error("Book counts (total, available, reserved) cannot be negative.");
     }
     // Consistency check: available + reserved should not exceed total
     if (available + reserved > total) {
        throw new Error(`Sum of available (${available}) and reserved (${reserved}) copies cannot exceed total copies (${total}).`);
    }
     return true;
}

// --- Helper to check related entities ---
// Throws errors if related entities don't exist.
const checkRelatedEntities = async (tx, { library_id, author_ids = [], genre_ids = [] }) => {
    if (library_id) {
        const library = await tx.library.findUnique({ where: { library_id }, select: { library_id: true } });
        if (!library) throw new Error(`Library with ID ${library_id} not found.`);
    }
    if (author_ids.length > 0) {
         const authors = await tx.author.findMany({ where: { author_id: { in: author_ids } }, select: { author_id: true } });
         const foundAuthorIds = authors.map(a => a.author_id);
         const missingAuthors = author_ids.filter(id => !foundAuthorIds.includes(id));
         if (missingAuthors.length > 0) throw new Error(`Invalid Author ID(s): ${missingAuthors.join(', ')}.`);
    }
    if (genre_ids.length > 0) {
         const genres = await tx.genre.findMany({ where: { genre_id: { in: genre_ids } }, select: { genre_id: true } });
         const foundGenreIds = genres.map(g => g.genre_id);
         const missingGenres = genre_ids.filter(id => !foundGenreIds.includes(id));
         if (missingGenres.length > 0) throw new Error(`Invalid Genre ID(s): ${missingGenres.join(', ')}.`);
    }
}


/**
 * @swagger
 * components:
 *   schemas:
 *     Book:
 *       # Already defined in swagger.js from previous steps
 *     BookInput:
 *       # Already defined in swagger.js from previous steps
 *     PaginationInfo:
 *       # Already defined in swagger.js from previous steps
 */


/**
 * @controller BookController
 */

/**
 * @method createBook
 * @description Adds a new book record to the library catalog. Requires Admin or Librarian role.
 * @route POST /api/v1/books
 * @access Admin, Librarian
 * @tag Books
 */
exports.createBook = async (req, res, next) => {
    try {
        const { library_id, title, author_ids = [], genre_ids = [],isbn, ...bookData } = req.body;

        // 1. Basic Input Validation
        if (!library_id || !title) {
             return res.status(400).json({ success: false, error: { message: 'Missing required fields: library_id, title' } });
        }
        if(req.body.genre_names || req.body.genre_names.length < 1){
            return res.status(400).json({ success: false, error: { message: 'At least one genre name is required.' } });
        }
        // Validate counts based on input data (no current data yet)
        validateBookCounts(bookData);

        // Set default available copies if not provided, ensuring consistency
        const totalCopies = bookData.total_copies ?? 1;
        const availableCopies = bookData.available_copies ?? totalCopies; // Default available to total if not set
         if (availableCopies > totalCopies) {
              return res.status(400).json({ success: false, error: { message: 'Available copies cannot exceed total copies.' } });
         }
        const reservedCopies = bookData.reserved_copies ?? 0;
        if (availableCopies + reservedCopies > totalCopies) {
            return res.status(400).json({ success: false, error: { message: 'Sum of available and reserved copies cannot exceed total copies.' } });
        }

        if (isbn) { // Check only if an ISBN was actually sent in the request
            const existingBookWithISBN = await prisma.book.findFirst({
                where: { isbn: isbn }, // Assumes isbn field has @unique constraint in schema
                select: { book_id: true } // Only need to know if it exists
            });

            if (existingBookWithISBN) {
                // ISBN exists, return a 409 Conflict error immediately
                return res.status(409).json({
                    success: false,
                    error: { message: `A book with ISBN ${isbn} already exists.` }
                });
            }
        }

        // 2. Check Related Entities within a Transaction
        await prisma.$transaction(async (tx) => {
            await checkRelatedEntities(tx, { library_id, author_ids, genre_ids });

            // 3. Create the book within the same transaction
            const newBook = await tx.book.create({
                data: {
                    ...bookData,
                    library_id,
                    title,
                    author_ids,
                    genre_ids,
                    total_copies: totalCopies,
                    available_copies: availableCopies,
                    reserved_copies: reservedCopies,
                },
            });

            // 4. Update Author's book_ids array (still within transaction)
            if (author_ids.length > 0) {
                await tx.author.updateMany({
                    where: { author_id: { in: author_ids } },
                    data: {
                        book_ids: { push: newBook.book_id } // Atomically add the new book ID
                    }
                });
            }

            // 5. Send success response *after* transaction commits
            handleSuccess(res, newBook, 201);
        });

    } catch (error) {
         // --- Specific Error Handling ---
         if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002' && error.meta?.target?.includes('isbn')) {
                 return res.status(409).json({ success: false, error: { message: 'ISBN already exists.' } });
            }
         }
         // Catch errors thrown by validation helpers
         if (error instanceof Error && (error.message.includes('not found') || error.message.includes('Invalid') || error.message.includes('cannot exceed') || error.message.includes('negative'))) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
         // Pass other errors to the global handler
        next(error);
    }
};

/**
 * @method getAllBooks
 * @description Fetches a paginated list of books, available to any authenticated user. Supports filtering and searching.
 * @route GET /api/v1/books
 * @access Authenticated Users
 * @tag Books
 */
exports.getAllBooks = async (req, res, next) => {
    try {
        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['title', 'isbn', 'available_copies', 'total_copies', 'published_date', 'added_on', 'updated_at'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'title'; // Default sort
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Filtering ---
        const { libraryId, authorId, genreId, available, search } = req.query;
        const where = {};

        if (libraryId) where.library_id = libraryId;
        if (authorId) where.author_ids = { has: authorId }; // Check if array contains the ID
        if (genreId) where.genre_ids = { has: genreId }; // Check if array contains the ID
        if (available === 'true') where.available_copies = { gt: 0 }; // Filter for available books
        if (available === 'false') where.available_copies = { lte: 0 }; // Filter for unavailable books
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { isbn: { contains: search, mode: 'insensitive' } },
                // Note: Searching within author/genre names requires joins or denormalization,
                // searching within IDs is handled above.
            ];
        }

        // --- Database Query ---
        const [booksData, totalBooks] = await prisma.$transaction([
            prisma.book.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                // REMOVED the include for author here
            }),
            prisma.book.count({ where })
        ]);
        
        // 2. Extract all unique author IDs from the results
        const allAuthorIds = booksData.reduce((ids, book) => {
            book.author_ids.forEach(id => ids.add(id));
            return ids;
        }, new Set()); // Use a Set to get unique IDs automatically
        
        const uniqueAuthorIds = Array.from(allAuthorIds); // Convert Set back to Array
        
        // 3. Fetch the corresponding authors IF there are any IDs
        let authorsMap = {}; // Use a map for easy lookup: { authorId: name }
        if (uniqueAuthorIds.length > 0) {
            const authors = await prisma.author.findMany({
                where: {
                    author_id: {
                        in: uniqueAuthorIds
                    }
                },
                select: {
                    author_id: true,
                    name: true
                }
            });
            // Create the lookup map
            authors.forEach(author => {
                authorsMap[author.author_id] = author.name;
            });
        }
        
        // 4. Map author names onto the book data (Modify the response structure)
        const booksWithAuthorNames = booksData.map(book => {
            return {
                ...book, // Spread existing book properties
                // Add a new field, e.g., 'authorNames'
                authorNames: book.author_ids.map(id => authorsMap[id] || 'Unknown Author').filter(name => name !== 'Unknown Author'), // Map IDs to names, handle missing authors
                // Or replace author_ids if you prefer
                // authors: book.author_ids.map(id => ({ id: id, name: authorsMap[id] || 'Unknown Author' })).filter(a => a.name !== 'Unknown Author')
            };
        });
        
        
        // --- Response ---
        handleSuccess(res, {
            // Send the modified data
            data: booksWithAuthorNames,
            pagination: {
                totalItems: totalBooks,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalBooks / limit)
            }
        });
        
    } catch (error) {
         // Handle potential errors from invalid query params (e.g., non-UUID format for IDs)
         // Prisma might throw validation errors for invalid UUID formats
         if (error instanceof Prisma.PrismaClientValidationError) {
            return res.status(400).json({ success: false, error: { message: "Invalid filter parameter format (e.g., UUID expected)." } });
         }
        next(error);
    }
};

/**
 * @method getBookById
 * @description Fetches details of a specific book by its ID. Available to any authenticated user.
 * @route GET /api/v1/books/{id}
 * @access Authenticated Users
 * @tag Books
 */
exports.getBookById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const book = await prisma.book.findUniqueOrThrow({
             where: { book_id: id },
             // Optional: Include related data if desired for the detail view
             // include: {
             //    library: { select: { library_id: true, name: true } },
             //    // Maybe fetch author/genre names (requires separate queries or schema change)
             // }
        });
        handleSuccess(res, book);
    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};

/**
 * @method updateBook
 * @description Updates details of an existing book. Requires Admin or Librarian role.
 * @route PUT /api/v1/books/{id}
 * @access Admin, Librarian
 * @tag Books
 */
exports.updateBook = async (req, res, next) => {
    const { id } = req.params;
    const { library_id, title, author_ids, genre_ids, ...updateData } = req.body; // library_id usually not changed via this endpoint

    // Prevent updating with an empty object
    if (Object.keys(req.body).length === 1 && req.body.id) { // Check if only id was passed somehow
        // Or more robustly: check if updateData and potentially author/genre arrays are empty
        if (Object.keys(updateData).length === 0 && author_ids === undefined && genre_ids === undefined) {
            return res.status(400).json({ success: false, error: { message: 'No update data provided.' } });
        }
    }

    try {
        // Use transaction for multi-step update (fetch, validate, update book, update authors)
        const updatedBook = await prisma.$transaction(async (tx) => {
            // 1. Get current book data (needed for validation and array diff)
            const currentBook = await tx.book.findUniqueOrThrow({
                where: { book_id: id },
                select: { author_ids: true, genre_ids: true, total_copies: true } // Select fields needed for logic
            });

            // 2. Validate counts (pass current total for comparison)
            validateBookCounts(updateData, currentBook.total_copies);

            // 3. Check existence of new authors/genres if arrays are provided
            await checkRelatedEntities(tx, { author_ids: author_ids ?? [], genre_ids: genre_ids ?? [] });


            // 4. Prepare final update data
            const finalUpdateData = {
                ...updateData,
                 // Only include author_ids/genre_ids if they were actually passed in the request
                 ...(author_ids !== undefined && { author_ids: author_ids }),
                 ...(genre_ids !== undefined && { genre_ids: genre_ids }),
                 // Ensure consistency if counts are updated
                 total_copies: updateData.total_copies ?? currentBook.total_copies,
                 // Recalculate available if total changes and available isn't explicitly set? Decide on logic.
                 // Example: Keep proportion (more complex) or require explicit available_copies if total changes.
                 // Simple approach: Use provided available/reserved or keep current ones if not provided.
                 available_copies: updateData.available_copies,
                 reserved_copies: updateData.reserved_copies,
            };


            // 5. Update the book
            const bookAfterUpdate = await tx.book.update({
                where: { book_id: id },
                data: finalUpdateData,
            });

            // 6. Update Author book_ids arrays *if* author_ids were changed
            const oldAuthorIds = currentBook.author_ids;
            const newAuthorIds = bookAfterUpdate.author_ids; // Use the IDs actually stored after update

            if (JSON.stringify(oldAuthorIds.sort()) !== JSON.stringify(newAuthorIds.sort())) {
                 const authorsToAdd = newAuthorIds.filter(aid => !oldAuthorIds.includes(aid));
                 const authorsToRemove = oldAuthorIds.filter(aid => !newAuthorIds.includes(aid));

                 // Add book ID to new authors
                 if (authorsToAdd.length > 0) {
                     await tx.author.updateMany({
                         where: { author_id: { in: authorsToAdd } },
                         data: { book_ids: { push: id } }
                     });
                 }
                 // Remove book ID from old authors
                 if (authorsToRemove.length > 0) {
                    // This requires fetching each author individually to update the array correctly
                     const authorsToUpdate = await tx.author.findMany({
                         where: { author_id: { in: authorsToRemove } },
                         select: { author_id: true, book_ids: true }
                     });
                     for (const author of authorsToUpdate) {
                         const updatedBookIds = author.book_ids.filter(bid => bid !== id);
                         await tx.author.update({
                             where: { author_id: author.author_id },
                             data: { book_ids: updatedBookIds }
                         });
                     }
                 }
            } // end if author_ids changed

            return bookAfterUpdate; // Return the updated book from the transaction block

        }); // End transaction

        handleSuccess(res, updatedBook); // Send response after transaction succeeds

    } catch (error) {
         // --- Specific Error Handling ---
         if (error instanceof Prisma.PrismaClientKnownRequestError) {
             if (error.code === 'P2002' && error.meta?.target?.includes('isbn')) {
                 return res.status(409).json({ success: false, error: { message: 'ISBN already exists for another book.' } });
             }
             // P2025 (NotFound) will be caught by global handler if findUniqueOrThrow fails initially
         }
         // Catch errors thrown by validation helpers or entity checks
         if (error instanceof Error && (error.message.includes('not found') || error.message.includes('Invalid') || error.message.includes('cannot exceed') || error.message.includes('negative'))) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // Pass other errors to global handler
        next(error);
    }
};

/**
 * @method deleteBook
 * @description Permanently deletes a book record. Requires Admin or Librarian role. Cannot delete if there are active borrows or reservations.
 * @route DELETE /api/v1/books/{id}
 * @access Admin, Librarian
 * @tag Books
 */
exports.deleteBook = async (req, res, next) => {
    const { id } = req.params;

    try {
        // Use transaction to ensure checks and delete happen atomically if possible,
        // or at least that we don't delete if checks fail.
        await prisma.$transaction(async (tx) => {
             // 1. Check for active borrows or reservations
             const activeBorrows = await tx.borrowTransaction.count({
                 where: { book_id: id, status: { not: 'returned' } } // Check borrowed or overdue
             });
             const activeReservations = await tx.reservation.count({
                 where: { book_id: id } // Check if any reservation exists
                 // Add expiry check if needed: AND: { expires_at: { gt: new Date() } }
             });

             if (activeBorrows > 0 || activeReservations > 0) {
                // Throw an error to rollback transaction and send specific response
                 throw new Error(`Cannot delete book: ${activeBorrows} active borrow(s) and ${activeReservations} active reservation(s) exist.`);
             }

            // 2. Get book details *before* deleting to update author arrays
             const bookToDelete = await tx.book.findUnique({
                 where: { book_id: id },
                 select: { author_ids: true }
             });

             // If book not found here, delete below will throw P2025 handled globally
             if (bookToDelete && bookToDelete.author_ids.length > 0) {
                // 3. Remove book ID from author arrays (similar logic as update)
                 const authorsToUpdate = await tx.author.findMany({
                     where: { author_id: { in: bookToDelete.author_ids } },
                     select: { author_id: true, book_ids: true }
                 });
                 for (const author of authorsToUpdate) {
                     const updatedBookIds = author.book_ids.filter(bid => bid !== id);
                     await tx.author.update({
                         where: { author_id: author.author_id },
                         data: { book_ids: updatedBookIds }
                     });
                 }
             }

            // 4. Delete the book
            await tx.book.delete({
                where: { book_id: id }
            });
        }); // End transaction

        res.status(204).send(); // No content on successful delete

    } catch (error) {
        // Catch the specific error thrown for active relations
         if (error instanceof Error && error.message.startsWith('Cannot delete book:')) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};