// src/controllers/review.controller.js
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

// --- Validation Helper ---
const validateReviewInput = (data) => {
    const errors = [];
    if (data.rating !== undefined && data.rating !== null) {
        const rating = parseInt(data.rating, 10);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            errors.push('Rating must be an integer between 1 and 5.');
        }
        data.rating = rating; // Ensure stored as integer
    }
    // Add comment length validation if desired
    // if (data.comment && data.comment.length > 1000) {
    //     errors.push('Comment cannot exceed 1000 characters.');
    // }

    if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(' ')}`);
    }
    return data; // Return potentially type-coerced data
};


/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       # Already defined in swagger.js
 *     ReviewInput:
 *       type: object
 *       required: [bookId] # Rating/comment optional on create? Decide based on requirements. Let's make rating required.
 *       properties:
 *         bookId:
 *           type: string
 *           format: uuid
 *           description: The ID of the book being reviewed.
 *         rating:
 *           type: integer
 *           format: int32
 *           minimum: 1
 *           maximum: 5
 *           description: Rating score from 1 to 5.
 *         comment:
 *           type: string
 *           nullable: true
 *           description: User's comment about the book.
 *     ReviewUpdateInput: # Separate schema for update, making fields optional
 *       type: object
 *       properties:
 *         rating:
 *           type: integer
 *           format: int32
 *           minimum: 1
 *           maximum: 5
 *           description: Rating score from 1 to 5.
 *         comment:
 *           type: string
 *           nullable: true
 *           description: User's comment about the book.
 *     ReviewWithDetails: # For displaying reviews with user/book context
 *       allOf:
 *         - $ref: '#/components/schemas/Review'
 *         - type: object
 *           properties:
 *             user:
 *               type: object
 *               properties:
 *                 user_id: { type: string, format: uuid }
 *                 name: { type: string }
 *             book:
 *               type: object
 *               properties:
 *                 book_id: { type: string, format: uuid }
 *                 title: { type: string }
 *     PaginationInfo:
 *       # Already defined in swagger.js
 *   parameters:
 *      ReviewIdPathParam:
 *        name: reviewId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the review.
 *      BookIdPathParam:
 *        name: bookId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the book.
 *      UserIdPathParam:
 *        name: userId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the user.
 */

/**
 * @controller ReviewController
 */

/**
 * @method createReview
 * @description Submits a review for a book by the authenticated user. A user can only review a book once.
 * @route POST /api/v1/reviews
 * @access Member
 * @tag Reviews
 */
exports.createReview = async (req, res, next) => {
    const userId = req.user.id;
    const { bookId, rating, comment } = req.body;

    try {
        // 1. Input Validation
        if (!bookId) {
            return res.status(400).json({ success: false, error: { message: 'bookId is required.' } });
        }
        // Require rating on creation
        if (rating === undefined || rating === null) {
             return res.status(400).json({ success: false, error: { message: 'Rating is required.' } });
        }
        const validatedData = validateReviewInput({ rating, comment }); // Throws validation error

        // 2. Check Book Existence (within transaction)
        const newReview = await prisma.$transaction(async (tx) => {
            const book = await tx.book.findUnique({
                where: { book_id: bookId },
                select: { book_id: true }
            });
            if (!book) {
                throw new Error(`Book with ID ${bookId} not found.`);
            }

            // 3. Create Review (Handles unique constraint automatically)
            return tx.review.create({
                data: {
                    user_id: userId,
                    book_id: bookId,
                    rating: validatedData.rating,
                    comment: validatedData.comment,
                    // reviewed_at defaults via schema
                },
                 include: { // Include user/book for response context
                     user: { select: { user_id: true, name: true } },
                     book: { select: { book_id: true, title: true } }
                 }
            });
        }); // End transaction

        handleSuccess(res, newReview, 201);

    } catch (error) {
        // Handle unique constraint violation (already reviewed)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             if (error.meta?.target?.includes('user_id') && error.meta?.target?.includes('book_id')) {
                return res.status(409).json({ success: false, error: { message: 'You have already reviewed this book.' } });
             }
        }
         // Handle custom errors (validation, book not found)
         if (error instanceof Error && (error.message.includes('not found') || error.message.includes('Validation failed'))) {
             return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // P2025 on user/book lookup (shouldn't happen if checks are done) handled globally
        next(error);
    }
};

/**
 * @method getReviewsForBook
 * @description Retrieves a paginated list of reviews for a specific book. Available to any authenticated user.
 * @route GET /api/v1/reviews/book/{bookId}
 * @access Authenticated Users
 * @tag Reviews
 */
exports.getReviewsForBook = async (req, res, next) => {
    try {
        const { bookId } = req.params;

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['reviewed_at', 'rating'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'reviewed_at';
        const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'; // Default newest first

        // --- Database Query ---
        const [reviews, totalReviews] = await prisma.$transaction([
            prisma.review.findMany({
                where: { book_id: bookId },
                skip: skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { // Include user name for display
                    user: { select: { user_id: true, name: true } }
                }
            }),
            prisma.review.count({ where: { book_id: bookId } })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: reviews,
            pagination: {
                totalItems: totalReviews,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalReviews / limit)
            }
        });
    } catch (error) {
        // Handle Prisma validation error for invalid bookId format
         if (error instanceof Prisma.PrismaClientValidationError) {
            return res.status(400).json({ success: false, error: { message: "Invalid Book ID format." } });
         }
        next(error);
    }
};

/**
 * @method getMyReviews
 * @description Retrieves the authenticated user's submitted reviews.
 * @route GET /api/v1/reviews/my
 * @access Member
 * @tag Reviews
 */
exports.getMyReviews = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['reviewed_at', 'rating'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'reviewed_at';
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Database Query ---
        const [reviews, totalReviews] = await prisma.$transaction([
            prisma.review.findMany({
                where: { user_id: userId },
                skip: skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { // Include book title
                    book: { select: { book_id: true, title: true } }
                }
            }),
            prisma.review.count({ where: { user_id: userId } })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: reviews,
            pagination: {
                totalItems: totalReviews,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalReviews / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};


/**
 * @method updateReview
 * @description Updates a review submitted by the authenticated user. Admins can update any review.
 * @route PUT /api/v1/reviews/{reviewId}
 * @access Member (own), Admin
 * @tag Reviews
 */
exports.updateReview = async (req, res, next) => {
    try {
        const { reviewId } = req.params;
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;
        const { rating, comment } = req.body;

        // 1. Input Validation
        if (rating === undefined && comment === undefined) {
            return res.status(400).json({ success: false, error: { message: 'No update data provided (rating or comment required).' } });
        }
        const validatedData = validateReviewInput({ rating, comment }); // Validate provided fields

        // 2. Fetch review & Check Ownership/Permissions (within transaction?) - Simpler: fetch first
        const review = await prisma.review.findUniqueOrThrow({
             where: { review_id: reviewId },
             select: { user_id: true } // Only need owner ID for check
        });

        // 3. Authorization Check
        if (requestingUserRole === 'Member' && review.user_id !== requestingUserId) {
             return res.status(403).json({ success: false, error: { message: 'Forbidden: You can only update your own reviews.' } });
        }
        // Admins can proceed

        // 4. Perform Update
        const updatedReview = await prisma.review.update({
            where: { review_id: reviewId },
            data: {
                // Only include fields if they were validated (i.e., passed in request)
                ...(validatedData.rating !== undefined && { rating: validatedData.rating }),
                ...(validatedData.comment !== undefined && { comment: validatedData.comment }),
                // reviewed_at is not updated, but updated_at will be implicitly handled if schema has @updatedAt
            },
             include: { // Include details in response
                 user: { select: { user_id: true, name: true } },
                 book: { select: { book_id: true, title: true } }
             }
        });

        handleSuccess(res, updatedReview);

    } catch (error) {
         // Handle validation errors
         if (error instanceof Error && error.message.includes('Validation failed')) {
             return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};

/**
 * @method deleteReview
 * @description Deletes a review. Members can delete their own, Admins can delete any.
 * @route DELETE /api/v1/reviews/{reviewId}
 * @access Member (own), Admin
 * @tag Reviews
 */
exports.deleteReview = async (req, res, next) => {
    try {
        const { reviewId } = req.params;
        const requestingUserId = req.user.id;
        const requestingUserRole = req.user.role;

        // 1. Fetch review & Check Ownership/Permissions
         const review = await prisma.review.findUniqueOrThrow({
             where: { review_id: reviewId },
             select: { user_id: true } // Only need owner ID for check
         });

        // 2. Authorization Check
        if (requestingUserRole === 'Member' && review.user_id !== requestingUserId) {
             return res.status(403).json({ success: false, error: { message: 'Forbidden: You can only delete your own reviews.' } });
        }
        // Admins can proceed

        // 3. Perform Delete
        await prisma.review.delete({
            where: { review_id: reviewId }
        });

        res.status(204).send(); // No content on successful delete

    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};


// Optional: Admin endpoint to get all reviews
/**
 * @method getAllReviewsAdmin
 * @description Retrieves all reviews across all users and books (Admin/Librarian only).
 * @route GET /api/v1/reviews
 * @access Admin, Librarian
 * @tag Reviews
 */
exports.getAllReviewsAdmin = async (req, res, next) => {
    try {
        // RBAC check done in route middleware

        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['reviewed_at', 'rating', 'user_id', 'book_id'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'reviewed_at';
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Filtering ---
        const { userId, bookId, minRating, maxRating } = req.query;
        const where = {};
        if (userId) where.user_id = userId;
        if (bookId) where.book_id = bookId;
        if (minRating || maxRating) {
            where.rating = {};
            if (minRating) where.rating.gte = parseInt(minRating, 10);
            if (maxRating) where.rating.lte = parseInt(maxRating, 10);
        }

        // --- Database Query ---
        const [reviews, totalReviews] = await prisma.$transaction([
            prisma.review.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: {
                    user: { select: { user_id: true, name: true, email: true } },
                    book: { select: { book_id: true, title: true } }
                }
            }),
            prisma.review.count({ where })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: reviews,
            pagination: {
                totalItems: totalReviews,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalReviews / limit)
            }
        });

    } catch (error) {
         if (error instanceof Prisma.PrismaClientValidationError || error instanceof TypeError) {
            return res.status(400).json({ success: false, error: { message: "Invalid filter parameter format." } });
         }
        next(error);
    }
};