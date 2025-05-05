// src/controllers/borrowTransaction.controller.js
const { Prisma } = require('@prisma/client');
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

// Helper to calculate overdue days (excluding the due date itself)
const calculateOverdueDays = (borrowDate, returnDate, maxBorrowDays) => {
    if (!borrowDate || !returnDate || !maxBorrowDays || maxBorrowDays <= 0) return 0;

    // Calculate the actual due date
    const dueDate = new Date(borrowDate);
    dueDate.setDate(dueDate.getDate() + maxBorrowDays);
    dueDate.setHours(23, 59, 59, 999); // Due at the end of the day

    // Ensure returnDate is a Date object
    const actualReturnDate = new Date(returnDate);

    if (actualReturnDate <= dueDate) {
        return 0; // Returned on or before the due date
    }

    // Calculate the difference in milliseconds and convert to days
    const diffTime = actualReturnDate.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Use ceil to count any part of a day as a full day

    return Math.max(0, diffDays); // Ensure non-negative
};


/**
 * @swagger
 * components:
 *   schemas:
 *     BorrowTransaction:
 *       # Already defined in swagger.js
 *     Fine:
 *       # Already defined in swagger.js (needed for return response)
 *     BorrowInput:
 *       type: object
 *       required: [bookId]
 *       properties:
 *          bookId:
 *             type: string
 *             format: uuid
 *             description: The ID of the book to borrow.
 *     ReturnResponse:
 *       type: object
 *       properties:
 *          transaction:
 *             $ref: '#/components/schemas/BorrowTransaction'
 *          fineGenerated:
 *             $ref: '#/components/schemas/Fine'
 *             nullable: true
 *             description: Details of the fine generated, if any.
 *     PaginationInfo:
 *       # Already defined in swagger.js
 *   parameters:
 *      BorrowIdPathParam:
 *        name: borrowId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the borrow transaction.
 */

/**
 * @controller BorrowTransactionController
 */


/**
 * @method borrowBook
 * @description Creates a borrow transaction for the authenticated user. Checks availability, user limits, and handles reservations.
 * @route POST /api/v1/borrow-transactions
 * @access Member
 * @tag Borrow Transactions
 */
exports.borrowBook = async (req, res, next) => {
    const userId = req.user.id; // Get user ID from authenticated user
    const { bookId } = req.body;

    if (!bookId) {
        return res.status(400).json({ success: false, error: { message: 'bookId is required.' } });
    }

    try {
        const newTransaction = await prisma.$transaction(async (tx) => {
            // 1. Fetch necessary data concurrently
            const [user, book, reservation] = await Promise.all([
                tx.user.findUniqueOrThrow({ // Ensure user exists and is active
                    where: { user_id: userId, is_active: true },
                     select: { user_id: true, library_id: true, borrowed_book_ids: true, reserved_book_ids: true }
                }),
                tx.book.findUniqueOrThrow({ // Ensure book exists
                    where: { book_id: bookId },
                    select: { book_id: true, library_id: true, available_copies: true, reserved_copies: true }
                }),
                 // Check if this user has an active reservation for this book
                 tx.reservation.findFirst({
                     where: { user_id:userId, book_id: bookId },
                 })
            ]);

            // Basic check: User and Book belong to the same library? (Assuming single library context per transaction for now)
            // This might need refinement if users can borrow from other libraries
            if (user.library_id !== book.library_id) {
                throw new Error(`User and Book belong to different libraries. Cross-library borrowing not implemented.`);
            }

             // 2. Fetch library policy
             const policy = await tx.policy.findUniqueOrThrow({
                 where: { library_id: user.library_id }, // Assumes policy exists for the user's library
             });

             // 3. Perform validation checks
             if (user.borrowed_book_ids.includes(bookId)) {
                 throw new Error(`User has already borrowed this book and not returned it.`);
             }
             if (user.borrowed_book_ids.length >= policy.max_books_per_user) {
                throw new Error(`User has reached the borrowing limit of ${policy.max_books_per_user} books.`);
             }

            let availableToBorrow = book.available_copies;
            let reservedDecrement = 0;

             // Handle reservation logic
             if (reservation) {
                 // User has a reservation. They can borrow even if available_copies is 0, consuming a reserved copy.
                 if (book.reserved_copies <= 0) {
                     // Data inconsistency? Reservation exists but no reserved copies? Log error.
                     console.error(`Inconsistency: Reservation found for user ${userId} book ${bookId}, but reserved_copies is ${book.reserved_copies}`);
                     // Decide how to handle - maybe still allow borrow if total > borrowed? For now, block.
                      throw new Error(`Book is reserved but no reserved copies available. Please contact library staff.`);
                 }
                 reservedDecrement = 1; // We will decrement reserved copies
             } else {
                 // No reservation, standard borrow check
                 if (availableToBorrow <= 0) {
                     throw new Error(`Book is not available for borrowing (0 available copies).`);
                 }
             }


            // 4. Perform updates
            // a) Update book counts
            await tx.book.update({
                where: { book_id: bookId },
                data: {
                    available_copies: { decrement: (reservedDecrement === 0 ? 1 : 0) }, // Decrement available only if NOT borrowing a reserved copy
                    reserved_copies: { decrement: reservedDecrement }, // Decrement reserved if borrowing reserved copy
                }
            });

            // b) Update user's borrowed list (and potentially reserved list)
            const updatedUserData = { borrowed_book_ids: { push: bookId } };
             if (reservation) {
                updatedUserData.reserved_book_ids = user.reserved_book_ids.filter(id => id !== bookId); // Remove book from reserved list
             }
             await tx.user.update({
                where: { user_id: userId },
                data: updatedUserData
             });

            // c) Delete the reservation if it existed
            if (reservation) {
                 await tx.reservation.delete({
                     where: { reservation_id: reservation.reservation_id }
                 });
            }

            // d) Create the borrow transaction record
            const borrowRecord = await tx.borrowTransaction.create({
                data: {
                    user_id: userId,
                    book_id: bookId,
                    status: 'requested', // Initial status
                    // borrow_date defaults to now() via schema
                }
            });

            return borrowRecord; // Return the created transaction

        }, {
             maxWait: 10000, // Allow 10 seconds for the transaction
             timeout: 20000, // Overall timeout
        }); // End transaction

        handleSuccess(res, newTransaction, 201);

    } catch (error) {
         // Handle specific errors thrown within the transaction
         console.error('Error during borrow transaction:', error); // Log the error for debugging
         
         if (error instanceof Error && (error.message.includes('borrowed this book') || error.message.includes('borrowing limit') || error.message.includes('not available') || error.message.includes('different libraries') || error.message.includes('reserved copies available'))) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
         // Handle Prisma 'RecordNotFound' errors if findUniqueOrThrow was used incorrectly or for policy/user/book lookups
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
              const entity = error.meta?.modelName || error.meta?.cause || 'Required record';
              return res.status(404).json({ success: false, error: { message: `${entity} not found.` } });
         }
        next(error); // Pass other errors to global handler
    }
};

/**
 * @method returnBook
 * @description Marks a borrow transaction as returned, updates book availability, and potentially generates a fine if overdue.
 * @route PUT /api/v1/borrow-transactions/{borrowId}/return
 * @access Member (own), Librarian (any in their library)
 * @tag Borrow Transactions
 */
exports.returnBook = async (req, res, next) => {
    const { borrowId } = req.params;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch the transaction and related data
            const transaction = await tx.borrowTransaction.findUniqueOrThrow({
                where: { borrow_id: borrowId },
                include: {
                    user: { select: { user_id: true, library_id: true, borrowed_book_ids: true } }, // Include library_id for policy lookup
                    book: { select: { book_id: true, library_id: true } } // Include library_id for sanity check
                }
            });

            // 2. Authorization check: Member can only return their own, Librarian can return any
            if (requestingUserRole === 'Member' && transaction.user_id !== requestingUserId) {
                 throw new Error(`Forbidden: You can only return your own borrowed books.`); // Custom forbidden error
            }
            // Optional: Add check if Librarian belongs to the same library as the transaction

            // 3. Validation checks
            if (transaction.status === 'returned') {
                throw new Error(`This transaction has already been marked as returned.`);
            }
            // Optional: Check if user and book library match, though less critical on return
            // if (transaction.user.library_id !== transaction.book.library_id) { ... }

             // 4. Fetch the library policy for fine calculation
             const policy = await tx.policy.findUniqueOrThrow({
                 where: { library_id: transaction.user.library_id },
             });


            // 5. Determine return date and new status
            const returnDate = new Date(); // Use current server time as return date
            let newStatus = 'returned';

            // 6. Calculate overdue days and fine
            const overdueDays = calculateOverdueDays(transaction.borrow_date, returnDate, policy.max_borrow_days);
            let fineGenerated = null;

            if (overdueDays > 0) {
                newStatus = 'overdue'; // Mark as overdue even if returned now, fine applies
                const fineAmount = overdueDays * parseFloat(policy.fine_per_day); // Ensure fine_per_day is treated as number

                // Create fine record
                fineGenerated = await tx.fine.create({
                    data: {
                        borrow_id: transaction.borrow_id,
                        user_id: transaction.user_id,
                        book_id: transaction.book_id,
                        library_id: transaction.user.library_id, // Use library from user/transaction context
                        amount: fineAmount,
                        reason: `Returned ${overdueDays} day(s) late.`,
                        is_paid: false,
                        // fine_date defaults to now()
                    }
                });
                 // If fine is generated, keep status 'overdue' until fine is paid?
                 // Or mark 'returned' here and let fine be tracked separately?
                 // Decision: Mark transaction 'returned' now, fine is separate record.
                 newStatus = 'returned'; // Override back to returned
            }

            // 7. Perform updates
            // a) Update transaction status and return date
             const updatedTransaction = await tx.borrowTransaction.update({
                where: { borrow_id: borrowId },
                data: {
                    status: newStatus,
                    return_date: returnDate,
                }
            });

            // b) Update book availability
            await tx.book.update({
                where: { book_id: transaction.book_id },
                data: {
                    available_copies: { increment: 1 } // Make one copy available again
                    // Should reserved_copies be touched? No, return adds to available pool.
                }
            });

            // c) Update user's borrowed list
            const updatedBorrowedIds = transaction.user.borrowed_book_ids.filter(id => id !== transaction.book_id);
            await tx.user.update({
                where: { user_id: transaction.user_id },
                data: {
                    borrowed_book_ids: updatedBorrowedIds
                }
            });

            return { transaction: updatedTransaction, fineGenerated }; // Return both updated transaction and any fine

        }, {
             maxWait: 10000,
             timeout: 20000,
        }); // End transaction

        handleSuccess(res, result); // Send back object containing transaction and potential fine

    } catch (error) {
         // Handle specific errors thrown within the transaction
         if (error instanceof Error && (error.message.includes('already been marked') || error.message.includes('Forbidden'))) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
          // Handle Not Found errors for transaction or policy
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
              const entity = error.meta?.modelName || error.meta?.cause || 'Required record';
              return res.status(404).json({ success: false, error: { message: `${entity} not found.` } });
         }
        next(error);
    }
};


/**
 * @method getAllBorrowTransactions
 * @description Retrieves a paginated list of borrow transactions. Admins/Librarians see all, Members see only their own.
 * @route GET /api/v1/borrow-transactions
 * @access Authenticated Users
 * @tag Borrow Transactions
 */
exports.getAllBorrowTransactions = async (req, res, next) => {
    try {
        // --- User Info & Permissions ---
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['borrow_date', 'return_date', 'status'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'borrow_date';
        const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

        // --- Filtering ---
        const { userId, bookId, status, libraryId } = req.query; // Allow filtering by these fields
        const where = {};

        // RBAC Filtering: Members can only see their own transactions
        if (requestingUserRole === 'member') {
            where.user_id = requestingUserId;
             // Prevent member from overriding filter to see others' transactions
             if (userId && userId !== requestingUserId) {
                 return res.status(403).json({ success: false, error: { message: "Forbidden: Members can only view their own transactions." } });
             }
        } else if (userId) {
             // Admins/Librarians can filter by userId
             where.user_id = userId;
        }
        // Add other filters if provided
        if (bookId) where.book_id = bookId;
        if (status) where.status = status;
        // TODO: Add filtering by libraryId (requires joining/including library info or adding library_id to transaction)

        // --- Database Query ---
        const [transactions, totalTransactions] = await prisma.$transaction([
            prisma.borrowTransaction.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { // Include basic user/book info for context
                    user: { select: { user_id: true, name: true, email: true } },
                    book: {
                        select: {
                            book_id: true,
                            title: true,
                            description: true,
                            available_copies: true, // Show availability
                             author_ids: true, // Maybe fetch author names requires another step
                             genre_ids: true,
                             cover_image_url: true,
                             total_copies: true,
                             available_copies: true,
                             reserved_copies: true,
                             author_ids: true,
                             library_id: true,
                        }
                    }
                }
            }),
            prisma.borrowTransaction.count({ where })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: transactions,
            pagination: {
                totalItems: totalTransactions,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalTransactions / limit)
            }
        });

    } catch (error) {
         if (error instanceof Prisma.PrismaClientValidationError) {
            return res.status(400).json({ success: false, error: { message: "Invalid filter parameter format." } });
         }
        next(error);
    }
};

/**
 * @method getBorrowTransactionById
 * @description Fetches details of a specific borrow transaction. Admins/Librarians see any, Members see only their own.
 * @route GET /api/v1/borrow-transactions/{borrowId}
 * @access Authenticated Users
 * @tag Borrow Transactions
 */
exports.getBorrowTransactionById = async (req, res, next) => {
    try {
        const { borrowId } = req.params;
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        const transaction = await prisma.borrowTransaction.findUniqueOrThrow({
             where: { borrow_id: borrowId },
             include: { // Include more details for single view
                 user: { select: { user_id: true, name: true, email: true, library_id: true } },
                 book: { select: { book_id: true, title: true, isbn: true, library_id: true } },
                 fine: true // Include associated fine if it exists
             }
        });

        // RBAC Check: Members can only view their own transactions
        if (requestingUserRole === 'Member' && transaction.user_id !== requestingUserId) {
            // Use 403 Forbidden as they are authenticated but not authorized for this specific resource
             return res.status(403).json({ success: false, error: { message: "Forbidden: You can only view your own borrow transactions." } });
        }

        handleSuccess(res, transaction);

    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};

/**
 * @method cancelBorrow
 * @description Cancels an active borrow transaction (status='borrowed'). Restores book availability and user borrow slot.
 * @route DELETE /api/v1/borrow-transactions/{borrowId}/cancel
 * @access Member (own), Librarian, Admin
 * @tag Borrow Transactions
 */
exports.cancelBorrow = async (req, res, next) => {
    const { borrowId } = req.params;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Fetch the transaction to check status and ownership
            const transaction = await tx.borrowTransaction.findUniqueOrThrow({
                where: { borrow_id: borrowId },
                select: {
                    borrow_id: true,
                    user_id: true,
                    book_id: true,
                    status: true,
                    // Include user's borrowed_book_ids for update logic
                    user: { select: { user_id: true, borrowed_book_ids: true } }
                }
            });

            // 2. Authorization Check: Member can only cancel their own
            if (requestingUserRole === 'member' && transaction.user_id !== requestingUserId) {
                throw new Error(`Forbidden: You can only cancel your own borrow requests.`);
            }
            // Admins/Librarians can proceed

            // 3. Validation: Only cancel if status is 'borrowed'
            if (transaction.status !== 'requested') {
                throw new Error(`Cannot cancel transaction: Status is already '${transaction.status}'. Only 'requested' transactions can be cancelled.`);
            }

            // 4. Delete the Borrow Transaction record
            await tx.borrowTransaction.delete({
                where: { borrow_id: transaction.borrow_id }
            });

            // 5. Update Book Availability: Increment available copies
            // Note: We assume cancelling a borrow always returns the book to the 'available' pool.
            // If it was borrowed from a reservation, this logic might need refinement depending on desired behavior.
            // For simplicity, we just increment available_copies.
            await tx.book.update({
                where: { book_id: transaction.book_id },
                data: {
                    available_copies: { increment: 1 }
                    // Do not decrement reserved_copies here unless specific logic requires it.
                }
            });

            // 6. Update User's borrowed list: Remove the book ID
            if (transaction.user) { // Check if user data was successfully fetched
                const updatedBorrowedIds = transaction.user.borrowed_book_ids.filter(id => id !== transaction.book_id);
                await tx.user.update({
                    where: { user_id: transaction.user_id },
                    data: {
                        borrowed_book_ids: updatedBorrowedIds
                    }
                });
            } else {
                // Should not happen if transaction was found, but log a warning
                 console.warn(`User data not found for user ${transaction.user_id} during borrow cancellation ${transaction.borrow_id}. Skipping user update.`);
            }

            // No specific data to return on successful deletion

        }, { // Transaction options
            maxWait: 10000,
            timeout: 20000,
        }); // End transaction

        res.status(204).send(); // No content on successful cancellation/deletion

    } catch (error) {
        // Handle specific errors thrown within the transaction
        if (error instanceof Error && (error.message.includes('Forbidden') || error.message.includes('Cannot cancel transaction'))) {
           return res.status(400).json({ success: false, error: { message: error.message } });
        }
         // Handle Not Found errors for transaction
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             const entity = error.meta?.modelName || error.meta?.cause || 'Borrow transaction';
             return res.status(404).json({ success: false, error: { message: `${entity} not found.` } });
        }
       next(error);
    }
};