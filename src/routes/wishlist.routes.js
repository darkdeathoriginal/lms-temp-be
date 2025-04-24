// src/routes/wishlist.routes.js
const express = require('express');
const wishlistController = require('../controllers/wishlist.controller');
const { authenticate, isMember, isAdminOrLibrarian } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/wishlists
 */

/**
 * @swagger
 * /api/v1/wishlists:
 *   post:
 *     summary: Add a book to the user's wishlist (Member Only)
 *     tags: [Wishlists]
 *     description: Allows an authenticated member to add a book to their personal wishlist.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/WishlistInput' } } }
 *     responses:
 *       201: { description: 'Book added to wishlist successfully', content: { application/json: { schema: { $ref: '#/components/schemas/WishlistWithBook' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' } # If role is not Member
 *       404: { description: 'Not Found - Book not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       409: { description: 'Conflict - Book already in wishlist', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.post('/',
    authenticate,
    isMember, // Only members can add to their own wishlist
    wishlistController.addToWishlist
);

/**
 * @swagger
 * /api/v1/wishlists/my:
 *   get:
 *     summary: Get the authenticated user's wishlist (Member Only)
 *     tags: [Wishlists]
 *     description: Retrieves the wishlist for the currently logged-in member, including book details.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam', schema: { type: integer, default: 25 } } # Allow higher limit?
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'added_at', enum: [added_at] }
 *         description: Field to sort by (currently only added_at).
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *     responses:
 *       200: { description: "User's wishlist items", content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/WishlistWithBook' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' } # If role is not Member
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/my',
    authenticate,
    isMember, // Only members can view their own wishlist via this specific route
    wishlistController.getMyWishlist
);

/**
 * @swagger
 * /api/v1/wishlists/books/{bookId}:
 *   delete:
 *     summary: Remove a book from the user's wishlist (Member Only)
 *     tags: [Wishlists]
 *     description: Allows an authenticated member to remove a specific book from their wishlist.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/BookIdPathParam' }
 *     responses:
 *       204: { description: 'Book removed from wishlist successfully (No Content)' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' } # If role is not Member
 *       404: { description: 'Not Found - Book not found in the user wishlist', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.delete('/books/:bookId',
    authenticate,
    isMember, // Only members can remove from their own wishlist
    wishlistController.removeFromWishlist
);


/**
 * @swagger
 * /api/v1/wishlists:
 *   get:
 *     summary: Retrieve a list of all wishlist items (Admin/Librarian Only)
 *     tags: [Wishlists]
 *     description: Gets a paginated list of all wishlist items across all users. Requires Admin or Librarian role. Supports filtering.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'added_at', enum: [added_at, user_id, book_id] }
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
 *     responses:
 *       200: { description: 'A paginated list of all wishlist items', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/WishlistWithBook' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } } # Adjust schema ref if needed
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/',
    authenticate,
    isAdminOrLibrarian, // Only Admins/Librarians can view all wishlists
    wishlistController.getAllWishlists
);


module.exports = router;