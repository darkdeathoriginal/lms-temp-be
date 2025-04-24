// src/routes/book.routes.js
const express = require('express');
const bookController = require('../controllers/book.controller');
// --- Import Auth Middleware ---
const { authenticate, isAdmin, isLibrarian, isAdminOrLibrarian } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/books
 */

/**
 * @swagger
 * /api/v1/books:
 *   post:
 *     summary: Add a new book (Admin/Librarian Only)
 *     tags: [Books]
 *     description: Adds a new book record to the library catalog. Requires Admin or Librarian role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/BookInput' } } }
 *     responses:
 *       201: { description: 'Book created successfully', content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       409: { description: 'Conflict - ISBN already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.post('/',
    authenticate,       // Ensure user is logged in
    isAdminOrLibrarian, // Ensure user is Admin or Librarian
    bookController.createBook
);

/**
 * @swagger
 * /api/v1/books:
 *   get:
 *     summary: Retrieve a list of books (Authenticated Users)
 *     tags: [Books]
 *     description: Fetches a paginated list of books, available to any authenticated user. Supports filtering and searching.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'title', enum: [title, isbn, available_copies, total_copies, published_date, added_on] } # Example sort fields
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *       - { name: libraryId, in: query, schema: { type: string, format: uuid }, description: 'Filter by library ID' }
 *       - { name: authorId, in: query, schema: { type: string, format: uuid }, description: 'Filter by author ID (checks author_ids array)' }
 *       - { name: genreId, in: query, schema: { type: string, format: uuid }, description: 'Filter by genre ID (checks genre_ids array)' }
 *       - { name: available, in: query, schema: { type: boolean }, description: 'Filter by availability (true for available_copies > 0)' }
 *       - { name: search, in: query, schema: { type: string }, description: 'Search term for title or ISBN' }
 *     responses:
 *       200: { description: 'A paginated list of books', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Book' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' } # For invalid query params
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/',
    authenticate, // Requires any logged-in user
    bookController.getAllBooks
);

/**
 * @swagger
 * /api/v1/books/{id}:
 *   get:
 *     summary: Retrieve a single book by ID (Authenticated Users)
 *     tags: [Books]
 *     description: Fetches details of a specific book by its ID. Available to any authenticated user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid }, description: 'Book ID' }
 *     responses:
 *       200: { description: 'Book details', content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/:id',
    authenticate, // Requires any logged-in user
    bookController.getBookById
);

/**
 * @swagger
 * /api/v1/books/{id}:
 *   put:
 *     summary: Update a book by ID (Admin/Librarian Only)
 *     tags: [Books]
 *     description: Updates details of an existing book. Requires Admin or Librarian role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid }, description: 'Book ID' }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/BookInput' } } } # Reusing input schema, consider specific update schema if needed
 *     responses:
 *       200: { description: 'Book updated successfully', content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       409: { description: 'Conflict - ISBN already exists for another book', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.put('/:id',
    authenticate,       // Ensure logged in
    isAdminOrLibrarian, // Ensure role is sufficient
    bookController.updateBook
);

/**
 * @swagger
 * /api/v1/books/{id}:
 *   delete:
 *     summary: Delete a book by ID (Admin/Librarian Only)
 *     tags: [Books]
 *     description: Permanently deletes a book record. Requires Admin or Librarian role. Cannot delete if there are active borrows or reservations.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid }, description: 'Book ID' }
 *     responses:
 *       204: { description: 'Book deleted successfully (No Content)' }
 *       400: { description: 'Bad Request - Cannot delete book with active borrows/reservations', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.delete('/:id',
    authenticate,       // Ensure logged in
    isAdminOrLibrarian, // Ensure role is sufficient
    bookController.deleteBook
);

module.exports = router;