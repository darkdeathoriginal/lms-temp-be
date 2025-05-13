// src/controllers/fine.controller.js
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * components:
 *   schemas:
 *     Fine:
 *       # Already defined in swagger.js
 *     FineWithDetails: # For displaying fines with more context
 *       allOf:
 *         - $ref: '#/components/schemas/Fine'
 *         - type: object
 *           properties:
 *             user:
 *               type: object
 *               properties:
 *                 user_id: { type: string, format: uuid }
 *                 name: { type: string }
 *                 email: { type: string, format: "email" }
 *             book:
 *               type: object
 *               properties:
 *                 book_id: { type: string, format: uuid }
 *                 title: { type: string }
 *             library:
 *               type: object
 *               properties:
 *                 library_id: { type: string, format: uuid }
 *                 name: { type: string }
 *     PaginationInfo:
 *       # Already defined in swagger.js
 *   parameters:
 *      FineIdPathParam:
 *        name: fineId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the fine.
 *      UserIdPathParam: # Re-using from other controllers if defined
 *        name: userId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the user.
 */

/**
 * @controller FineController
 */

// NOTE: Fines are typically CREATED automatically by the returnBook logic
// in borrowTransaction.controller.js when a book is overdue.
// There isn't usually a direct POST /fines endpoint for manual fine creation via API,
// unless for administrative adjustments. We'll focus on GET and PUT (pay fine).

/**
 * @method getAllFines
 * @description Retrieves a paginated list of all fines. Admins/Librarians see all, Members see only their own unpaid fines.
 * @route GET /api/v1/fines
 * @access Authenticated Users
 * @tag Fines
 */
exports.getAllFines = async (req, res, next) => {
    try {
        // --- User Info & Permissions ---
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['fine_date', 'amount', 'is_paid', 'updated_at'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'fine_date';
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc'; // Default newest first

        // --- Filtering ---
        const { userId, bookId, libraryId, isPaid } = req.query;
        const where = {};

        // RBAC Filtering:
        if (requestingUserRole === 'Member') {
            where.user_id = requestingUserId;
            // Members usually only see their *unpaid* fines by default in a "my fines" view
            // If isPaid query param is not 'true', default to showing unpaid for members
            if (isPaid !== 'true') {
                 where.is_paid = false;
            } else { // if isPaid is 'true', member can see their paid fines
                where.is_paid = true;
            }
            // Prevent member from overriding userId filter
            if (userId && userId !== requestingUserId) {
                return res.status(403).json({ success: false, error: { message: "Forbidden: Members can only view their own fines." } });
            }
        } else { // Admin or Librarian
            if (userId) where.user_id = userId;
            if (isPaid !== undefined) where.is_paid = isPaid === 'true'; // Allow filtering by payment status
        }

        if (bookId) where.book_id = bookId;
        if (libraryId && (requestingUserRole === 'Admin' || requestingUserRole === 'Librarian')) {
            // Librarians might be restricted to their own library, Admin can see all.
            // For now, let's assume Librarians can filter by any library if they have general access to this endpoint.
            // More granular librarian access (e.g. only their library's fines) would need library_id on req.user
            where.library_id = libraryId;
        }


        // --- Database Query ---
        const [fines, totalFines] = await prisma.$transaction([
            prisma.fine.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { // Include context
                    user: { select: { user_id: true, name: true, email: true } },
                    book: { select: { book_id: true, title: true } },
                    library: { select: { library_id: true, name: true } }
                }
            }),
            prisma.fine.count({ where })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: fines,
            pagination: {
                totalItems: totalFines,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalFines / limit)
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
 * @method getFinesForUser
 * @description Retrieves a paginated list of fines for a specific user. Admins/Librarians can view any user's fines. Members can only view their own.
 * @route GET /api/v1/fines/user/{userId}
 * @access Member (own), Librarian, Admin
 * @tag Fines
 */
exports.getFinesForUser = async (req, res, next) => {
    try {
        const targetUserId = req.params.userId; // User whose fines are being requested
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        // Authorization: Member can only see their own fines
        if (requestingUserRole === 'Member' && targetUserId !== requestingUserId) {
            return res.status(403).json({ success: false, error: { message: "Forbidden: You can only view your own fines." } });
        }

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['fine_date', 'amount', 'is_paid'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'fine_date';
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Filtering by payment status ---
        const { isPaid } = req.query;
        const where = { user_id: targetUserId };
        if (isPaid !== undefined) where.is_paid = isPaid === 'true';


        // --- Database Query ---
        const [fines, totalFines] = await prisma.$transaction([
            prisma.fine.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: {
                    book: { select: { book_id: true, title: true } },
                    library: { select: { library_id: true, name: true } }
                }
            }),
            prisma.fine.count({ where })
        ]);

         // --- Response ---
        handleSuccess(res, {
            data: fines,
            pagination: {
                totalItems: totalFines,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalFines / limit)
            }
        });

    } catch (error) {
         if (error instanceof Prisma.PrismaClientValidationError) {
            return res.status(400).json({ success: false, error: { message: "Invalid parameter format." } });
         }
        next(error);
    }
};


/**
 * @method getFineById
 * @description Fetches details of a specific fine. Admins/Librarians see any, Members see only their own.
 * @route GET /api/v1/fines/{fineId}
 * @access Authenticated Users
 * @tag Fines
 */
exports.getFineById = async (req, res, next) => {
    try {
        const { fineId } = req.params;
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        const fine = await prisma.fine.findUniqueOrThrow({
             where: { fine_id: fineId },
             include: { // Include all details
                 user: { select: { user_id: true, name: true, email: true } },
                 book: { select: { book_id: true, title: true, isbn: true } },
                 library: { select: { library_id: true, name: true } },
                 borrow_transaction: true // Include the original borrow transaction
             }
        });

        // RBAC Check: Members can only view their own fines
        if (requestingUserRole === 'Member' && fine.user_id !== requestingUserId) {
             return res.status(403).json({ success: false, error: { message: "Forbidden: You can only view your own fines." } });
        }

        handleSuccess(res, fine);

    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};


/**
 * @method markFineAsPaid
 * @description Marks a fine as paid. Requires Admin or Librarian role.
 * @route PUT /api/v1/fines/{fineId}/pay
 * @access Admin, Librarian
 * @tag Fines
 */
exports.markFineAsPaid = async (req, res, next) => {
    try {
        const { fineId } = req.params;

        // Fetch fine to ensure it exists and isn't already paid
        const fine = await prisma.fine.findUniqueOrThrow({
            where: { fine_id: fineId },
            select: { is_paid: true, borrow_id: true }
        });

        if (fine.is_paid) {
            return res.status(400).json({ success: false, error: { message: 'This fine has already been paid.' } });
        }

        const updatedFine = await prisma.fine.update({
            where: { fine_id: fineId },
            data: {
                is_paid: true,
                // updated_at will be set automatically
            },
            include: { // Return full fine details
                 user: { select: { user_id: true, name: true } },
                 book: { select: { book_id: true, title: true } }
            }
        });

        // Optional: If a borrow transaction was 'overdue', should its status change back to 'returned'
        // once the associated fine is paid? This depends on business rules.
        // For simplicity, we don't change borrow_transaction status here,
        // but you could add logic to update it if needed.
        // Example:
        // if (fine.borrow_id) {
        //     await prisma.borrowTransaction.updateMany({
        //         where: { borrow_id: fine.borrow_id, status: 'overdue' },
        //         data: { status: 'returned' } // If fine payment means it's fully resolved
        //     });
        // }


        handleSuccess(res, updatedFine);

    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};


// DELETE /fines/{fineId} is typically NOT provided as fines are historical records.
// If needed for admin correction, it would be similar to other delete operations with Admin role.