// src/routes/review.routes.js
const express = require('express');
const reviewController = require('../controllers/review.controller');
const { authenticate, isMember, isAdmin, isAdminOrLibrarian, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/reviews
 */

/**
 * @swagger
 * /api/v1/reviews:
 *   post:
 *     summary: Submit a review for a book (Member Only)
 *     tags: [Reviews]
 *     description: Allows an authenticated member to submit a rating and optional comment for a book. A user can only review a book once.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ReviewInput' } } }
 *     responses:
 *       201: { description: 'Review submitted successfully', content: { application/json: { schema: { $ref: '#/components/schemas/ReviewWithDetails' } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' } # If role is not Member
 *       404: { description: 'Not Found - Book not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       409: { description: 'Conflict - Already reviewed this book', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.post('/',
    authenticate,
    isMember, // Only members can submit reviews
    reviewController.createReview
);

/**
 * @swagger
 * /api/v1/reviews:
 *   get:
 *     summary: Retrieve all reviews (Admin/Librarian Only)
 *     tags: [Reviews]
 *     description: Gets a paginated list of all reviews across all users and books. Supports filtering.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'reviewed_at', enum: [reviewed_at, rating, user_id, book_id] }
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *       - name: userId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Filter by User ID.
 *       - name: bookId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Filter by Book ID.
 *       - name: minRating
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 5 }
 *         description: Filter by minimum rating (inclusive).
 *       - name: maxRating
 *         in: query
 *         schema: { type: integer, minimum: 1, maximum: 5 }
 *         description: Filter by maximum rating (inclusive).
 *     responses:
 *       200: { description: 'A paginated list of all reviews', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/ReviewWithDetails' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/',
    authenticate,
    isAdminOrLibrarian, // Only Admins/Librarians can view all reviews
    reviewController.getAllReviewsAdmin
);


/**
 * @swagger
 * /api/v1/reviews/my:
 *   get:
 *     summary: Get the authenticated user's reviews (Member Only)
 *     tags: [Reviews]
 *     description: Retrieves all reviews submitted by the currently logged-in member.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'reviewed_at', enum: [reviewed_at, rating] }
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *     responses:
 *       200: { description: "User's submitted reviews", content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/ReviewWithDetails' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } } # Adjust schema if needed
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' } # If role is not Member
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/my',
    authenticate,
    isMember, // Only members can view their own reviews via this route
    reviewController.getMyReviews
);


/**
 * @swagger
 * /api/v1/reviews/book/{bookId}:
 *   get:
 *     summary: Retrieve reviews for a specific book (Authenticated Users)
 *     tags: [Reviews]
 *     description: Gets a paginated list of reviews for a given Book ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/BookIdPathParam' }
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'reviewed_at', enum: [reviewed_at, rating] }
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *     responses:
 *       200: { description: 'A paginated list of reviews for the book', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/ReviewWithDetails' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' } # For invalid Book ID format
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/book/:bookId',
    authenticate, // Any authenticated user can view reviews for a book
    reviewController.getReviewsForBook
);


/**
 * @swagger
 * /api/v1/reviews/{reviewId}:
 *   put:
 *     summary: Update a review (Member own, Admin any)
 *     tags: [Reviews]
 *     description: Updates the rating or comment of a specific review. Members can only update their own reviews. Admins can update any review.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/ReviewIdPathParam' }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ReviewUpdateInput' } } }
 *     responses:
 *       200: { description: 'Review updated successfully', content: { application/json: { schema: { $ref: '#/components/schemas/ReviewWithDetails' } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to update another user review', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.put('/:reviewId',
    authenticate,
    // Authorization (ownership/role check) happens inside the controller
    reviewController.updateReview
);

/**
 * @swagger
 * /api/v1/reviews/{reviewId}:
 *   delete:
 *     summary: Delete a review (Member own, Admin any)
 *     tags: [Reviews]
 *     description: Deletes a specific review. Members can only delete their own reviews. Admins can delete any review.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/ReviewIdPathParam' }
 *     responses:
 *       204: { description: 'Review deleted successfully (No Content)' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to delete another user review', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.delete('/:reviewId',
    authenticate,
    // Authorization (ownership/role check) happens inside the controller
    reviewController.deleteReview
);


module.exports = router;