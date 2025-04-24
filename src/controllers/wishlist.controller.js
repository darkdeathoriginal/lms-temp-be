// src/controllers/wishlist.controller.js
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * components:
 *   schemas:
 *     Wishlist:
 *       # Already defined in swagger.js
 *     WishlistWithBook: # Define a schema for wishlist items including book details
 *        allOf:
 *          - $ref: '#/components/schemas/Wishlist'
 *          - type: object
 *            properties:
 *              book:
 *                type: object
 *                properties:
 *                  book_id: { type: string, format: uuid }
 *                  title: { type: string }
 *                  # Add other relevant book fields if desired
 *                  description: { type: string, nullable: true }
 *                  available_copies: { type: integer }
 *     WishlistInput: # Input for adding to wishlist
 *       type: object
 *       required: [bookId]
 *       properties:
 *          bookId:
 *             type: string
 *             format: uuid
 *             description: The ID of the book to add to the wishlist.
 *     PaginationInfo:
 *       # Already defined in swagger.js
 *   parameters:
 *      BookIdPathParam: # Reusable param for identifying book in path
 *        name: bookId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the book.
 */

/**
 * @controller WishlistController
 */

/**
 * @method addToWishlist
 * @description Adds a book to the authenticated user's wishlist.
 * @route POST /api/v1/wishlists
 * @access Member
 * @tag Wishlists
 */
exports.addToWishlist = async (req, res, next) => {
    const userId = req.user.id; // From authenticate middleware
    const { bookId } = req.body;

    if (!bookId) {
        return res.status(400).json({ success: false, error: { message: 'bookId is required.' } });
    }

    try {
        const newWishlistItem = await prisma.$transaction(async (tx) => {
            // 1. Check if Book exists
            const book = await tx.book.findUnique({
                where: { book_id: bookId },
                select: { book_id: true } // Just need to know it exists
            });
            if (!book) {
                throw new Error(`Book with ID ${bookId} not found.`); // Custom error for transaction rollback
            }

            // 2. Attempt to create Wishlist item (unique constraint handles duplicates)
            const createdItem = await tx.wishlist.create({
                data: {
                    user_id: userId,
                    book_id: bookId,
                    // added_at defaults via schema
                },
                include: { book: { select: { book_id: true, title: true }} } // Include book title in response
            });

            // 3. Update User's wishlist_book_ids array (ensure consistency)
            await tx.user.update({
                where: { user_id: userId },
                data: {
                    wishlist_book_ids: { push: bookId }
                }
            });

            return createdItem;
        }); // End Transaction

        handleSuccess(res, newWishlistItem, 201);

    } catch (error) {
        // Handle unique constraint violation (already in wishlist)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             if (error.meta?.target?.includes('user_id') && error.meta?.target?.includes('book_id')) {
                return res.status(409).json({ success: false, error: { message: 'This book is already in your wishlist.' } });
             }
        }
        // Handle custom 'Book not found' error from transaction
         if (error instanceof Error && error.message.includes('not found')) {
             return res.status(404).json({ success: false, error: { message: error.message } });
         }
        // P2025 on user lookup during update (unlikely if authenticate worked) handled globally
        next(error);
    }
};

/**
 * @method removeFromWishlist
 * @description Removes a book from the authenticated user's wishlist using the Book ID.
 * @route DELETE /api/v1/wishlists/books/{bookId}
 * @access Member
 * @tag Wishlists
 */
exports.removeFromWishlist = async (req, res, next) => {
    const userId = req.user.id; // From authenticate middleware
    const { bookId } = req.params; // Get bookId from URL path

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Find the specific wishlist item to delete based on user and book ID
            // This implicitly checks ownership for the member role.
            const wishlistItem = await tx.wishlist.findUnique({
                where: {
                    user_id_book_id: { // Using the @@unique constraint index
                        user_id: userId,
                        book_id: bookId
                    }
                },
                select: { wishlist_id: true } // Just need ID to delete
            });

            // If item not found, throw error (means it wasn't on their list)
            if (!wishlistItem) {
                throw new Error(`Book with ID ${bookId} not found in your wishlist.`);
            }

            // 2. Delete the Wishlist item
            await tx.wishlist.delete({
                where: { wishlist_id: wishlistItem.wishlist_id }
            });

            // 3. Update User's wishlist_book_ids array
             const user = await tx.user.findUnique({ // Need current array
                 where: { user_id: userId },
                 select: { wishlist_book_ids: true }
             });
             if (user) {
                 const updatedWishlistIds = user.wishlist_book_ids.filter(id => id !== bookId);
                 await tx.user.update({
                     where: { user_id: userId },
                     data: { wishlist_book_ids: updatedWishlistIds }
                 });
             }
        }); // End Transaction

        res.status(204).send(); // No content on successful delete

    } catch (error) {
         // Handle custom 'not found in your wishlist' error
         if (error instanceof Error && error.message.includes('not found in your wishlist')) {
             return res.status(404).json({ success: false, error: { message: error.message } });
         }
        // P2025 if the delete target was somehow invalid handled globally
        next(error);
    }
};

/**
 * @method getMyWishlist
 * @description Retrieves the authenticated user's wishlist with book details.
 * @route GET /api/v1/wishlists/my
 * @access Member
 * @tag Wishlists
 */
exports.getMyWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // --- Pagination & Sorting (Optional for wishlist, but good practice) ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25)); // Default limit maybe higher for wishlist
        const skip = (page - 1) * limit;

        // Sorting: maybe by date added, or book title?
        const allowedSortBy = ['added_at']; // Add 'book.title' if needed (requires join sort capabilities)
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'added_at';
        const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'; // Default latest first

        // --- Database Query ---
        const [wishlistItems, totalItems] = await prisma.$transaction([
            prisma.wishlist.findMany({
                where: { user_id: userId },
                skip: skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { // Include book details
                    book: {
                        select: {
                            book_id: true,
                            title: true,
                            description: true,
                            available_copies: true, // Show availability
                            // author_ids: true, // Maybe fetch author names requires another step
                            // genre_ids: true,
                        }
                    }
                }
            }),
            prisma.wishlist.count({ where: { user_id: userId } })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: wishlistItems,
            pagination: {
                totalItems: totalItems,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalItems / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @method getAllWishlists (Admin/Librarian View - Optional)
 * @description Retrieves a paginated list of all wishlist items across all users. Requires Admin or Librarian role.
 * @route GET /api/v1/wishlists
 * @access Admin, Librarian
 * @tag Wishlists
 */
exports.getAllWishlists = async (req, res, next) => {
     try {
        // RBAC check happens in the route middleware (isAdminOrLibrarian)

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['added_at', 'user_id', 'book_id'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'added_at';
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Filtering ---
        const { userId, bookId } = req.query;
        const where = {};
        if (userId) where.user_id = userId;
        if (bookId) where.book_id = bookId;

        // --- Database Query ---
        const [wishlistItems, totalItems] = await prisma.$transaction([
            prisma.wishlist.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { // Include details for admin view
                    user: { select: { user_id: true, name: true, email: true } },
                    book: { select: { book_id: true, title: true } }
                }
            }),
            prisma.wishlist.count({ where })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: wishlistItems,
            pagination: {
                totalItems: totalItems,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalItems / limit)
            }
        });
    } catch (error) {
         if (error instanceof Prisma.PrismaClientValidationError) {
            return res.status(400).json({ success: false, error: { message: "Invalid filter parameter format." } });
         }
        next(error);
    }
};