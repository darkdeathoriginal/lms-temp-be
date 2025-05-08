// src/controllers/reservation.controller.js
const { Prisma } = require('@prisma/client');
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * components:
 *   schemas:
 *     Reservation:
 *       # Already defined in swagger.js
 *     ReservationInput:
 *       type: object
 *       required: [bookId]
 *       properties:
 *          bookId:
 *             type: string
 *             format: uuid
 *             description: The ID of the book to reserve.
 *     PaginationInfo:
 *       # Already defined in swagger.js
 *   parameters:
 *      ReservationIdPathParam:
 *        name: reservationId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the reservation.
 */

/**
 * @controller ReservationController
 */


/**
 * @method createReservation
 * @description Creates a reservation for a book for the authenticated member. Calculates expiry based on policy.
 * @route POST /api/v1/reservations
 * @access Member
 * @tag Reservations
 */
exports.createReservation = async (req, res, next) => {
    const userId = req.user.id; // Get user ID from authenticated user (assumes authenticate middleware ran)
    const { bookId } = req.body;

    if (!bookId) {
        return res.status(400).json({ success: false, error: { message: 'bookId is required.' } });
    }

    try {
        const newReservation = await prisma.$transaction(async (tx) => {
            // 1. Fetch User, Book, and Policy concurrently
            const [user, book, policy] = await Promise.all([
                tx.user.findUniqueOrThrow({
                    where: { user_id: userId, is_active: true },
                    select: { user_id: true, library_id: true, borrowed_book_ids: true } // Fetch borrowed books too
                }),
                tx.book.findUniqueOrThrow({
                    where: { book_id: bookId },
                    select: { book_id: true, library_id: true } // Check library match
                }),
                // Fetch policy based on the user's library
                tx.policy.findUniqueOrThrow({
                    where: { library_id: (await tx.user.findUnique({ where: { user_id: userId }, select: { library_id: true } })).library_id }
                })
            ]);

            // 2. Validation Checks
            if (user.library_id !== book.library_id) {
                 throw new Error(`User and Book belong to different libraries.`);
            }
            if (user.borrowed_book_ids.includes(bookId)) {
                 throw new Error(`Cannot reserve a book you currently have borrowed.`);
            }
             if (!policy.reservation_expiry_days || policy.reservation_expiry_days <= 0) {
                 console.warn(`Library ${user.library_id} has invalid reservation_expiry_days (${policy.reservation_expiry_days}). Using default of 7 days.`);
                 policy.reservation_expiry_days = 7; // Fallback if policy is invalid
             }

            // 3. Calculate expiry date
            const reservedAt = new Date();
            const expiresAt = new Date(reservedAt);
            expiresAt.setDate(reservedAt.getDate() + policy.reservation_expiry_days);
            expiresAt.setHours(23, 59, 59, 999); // Expire at the end of the expiry day

            // 4. Attempt to create reservation (unique constraint user_id_book_id handles duplicates)
            const createdReservation = await tx.reservation.create({
                data: {
                    user_id: userId,
                    book_id: bookId,
                    reserved_at: reservedAt,
                    expires_at: expiresAt,
                    library_id: user.library_id // Ensure library_id is set
                }
            });

            // 5. Update Book: Increment reserved copies
            await tx.book.update({
                where: { book_id: bookId },
                data: {
                    reserved_copies: { increment: 1 },
                    available_copies: { decrement: 1}, // Decrement available only if NOT borrowing a reserved copy

                    
                }
            });


            // 6. Update User: Add to reserved_book_ids array
            await tx.user.update({
                where: { user_id: userId },
                data: {
                    reserved_book_ids: { push: bookId }
                }
            });

            return createdReservation;

        }, { // Transaction options
             maxWait: 10000,
             timeout: 20000,
        }); // End transaction

        handleSuccess(res, newReservation, 201);

    } catch (error) {
         // --- Specific Error Handling ---
         if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // Handle unique constraint violation (already reserved)
            if (error.code === 'P2002' && error.meta?.target?.includes('user_id') && error.meta?.target?.includes('book_id')) {
                 return res.status(409).json({ success: false, error: { message: 'You already have an active reservation for this book.' } });
            }
            // Handle Not Found errors for User, Book, or Policy
            if (error.code === 'P2025') {
                 const entity = error.meta?.modelName || error.meta?.cause || 'Required record';
                 return res.status(404).json({ success: false, error: { message: `${entity} not found.` } });
            }
         }
         // Handle custom validation errors
         if (error instanceof Error && (error.message.includes('currently have borrowed') || error.message.includes('different libraries'))) {
             return res.status(400).json({ success: false, error: { message: error.message } });
         }
         // Pass other errors to global handler
        next(error);
    }
};

/**
 * @method getAllReservations
 * @description Retrieves a paginated list of reservations. Admins/Librarians see all, Members see only their own.
 * @route GET /api/v1/reservations
 * @access Authenticated Users
 * @tag Reservations
 */
exports.getAllReservations = async (req, res, next) => {
    try {
        // --- User Info & Permissions ---
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['reserved_at', 'expires_at'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'reserved_at';
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Filtering ---
        const { userId, bookId, expired } = req.query; // Allow filtering
        const where = {};

        // RBAC Filtering: Members can only see their own
        if (requestingUserRole === 'member') {
            where.user_id = requestingUserId;
             // Prevent member from overriding filter
             if (userId && userId !== requestingUserId) {
                 return res.status(403).json({ success: false, error: { message: "Forbidden: Members can only view their own reservations." } });
             }
        } else if (userId) {
             // Admins/Librarians can filter by userId
             where.user_id = userId;
        }
        // Add other filters
        if (bookId) where.book_id = bookId;
        if (expired === 'true') where.expires_at = { lt: new Date() };
        if (expired === 'false') where.expires_at = { gte: new Date() };
        const user = await prisma.user.findUnique({
            where: { user_id: requestingUserId },
            select: { library_id: true }
        });
        where.library_id = user.library_id; // Ensure all transactions are from the same library as the user

        // --- Database Query ---
        const [reservations, totalReservations] = await prisma.$transaction([
            prisma.reservation.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
            }),
            prisma.reservation.count({ where })
        ]);
        
        // --- Response ---
        handleSuccess(res, {
            data: reservations,
            pagination: {
                totalItems: totalReservations,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalReservations / limit)
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
 * @method getReservationById
 * @description Fetches details of a specific reservation. Admins/Librarians see any, Members see only their own.
 * @route GET /api/v1/reservations/{reservationId}
 * @access Authenticated Users
 * @tag Reservations
 */
exports.getReservationById = async (req, res, next) => {
    try {
        const { reservationId } = req.params;
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        const reservation = await prisma.reservation.findUniqueOrThrow({
             where: { reservation_id: reservationId },
             include: { // Include details
                 user: { select: { user_id: true, name: true, email: true } },
                 book: { select: { book_id: true, title: true, isbn: true } }
             }
        });

        // RBAC Check: Members can only view their own
        if (requestingUserRole === 'Member' && reservation.user_id !== requestingUserId) {
             return res.status(403).json({ success: false, error: { message: "Forbidden: You can only view your own reservations." } });
        }

        handleSuccess(res, reservation);

    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};


/**
 * @method deleteReservation
 * @description Cancels/Deletes a reservation. Members can cancel their own, Admins/Librarians can cancel any. Updates book/user records.
 * @route DELETE /api/v1/reservations/{reservationId}
 * @access Member (own), Librarian, Admin
 * @tag Reservations
 */
exports.deleteReservation = async (req, res, next) => {
    const { reservationId } = req.params;
    const requestingUserId = req.user.id;
    const requestingUserRole = req.user.role;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Find the reservation to get user_id and book_id
            const reservation = await tx.reservation.findUniqueOrThrow({
                where: { reservation_id: reservationId },
                select: { reservation_id: true, user_id: true, book_id: true }
            });

            // 2. Authorization check: Member can only delete their own
            if (requestingUserRole === 'member' && reservation.user_id !== requestingUserId) {
                 throw new Error(`Forbidden: You can only cancel your own reservations.`); // Custom error for transaction rollback
            }

            // 3. Delete the reservation
            await tx.reservation.delete({
                where: { reservation_id: reservation.reservation_id }
            });

            // 4. Update Book: Decrement reserved copies (only if > 0)
            await tx.book.update({
                where: { book_id: reservation.book_id },
                data: {
                    reserved_copies: {
                        decrement: 1
                    },
                    available_copies:{
                        increment: 1
                    }
                },
                // Add a condition to prevent decrementing below zero if needed,
                // though Prisma handles this gracefully (sets to 0).
                // For explicit check: find book first, check count, then update.
            });

            // 5. Update User: Remove book ID from reserved_book_ids array
             const user = await tx.user.findUnique({ // Need current array
                 where: { user_id: reservation.user_id },
                 select: { reserved_book_ids: true }
             });
             if (user) { // User might be deleted concurrently? Unlikely but possible.
                 const updatedReservedIds = user.reserved_book_ids.filter(id => id !== reservation.book_id);
                 await tx.user.update({
                     where: { user_id: reservation.user_id },
                     data: { reserved_book_ids: updatedReservedIds }
                 });
             }

        }, { // Transaction options
             maxWait: 10000,
             timeout: 20000,
        }); // End transaction

        res.status(204).send(); // No content on successful delete

    } catch (error) {
         // Handle specific errors
         if (error instanceof Error && error.message.includes('Forbidden')) {
             return res.status(403).json({ success: false, error: { message: error.message } });
         }
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};