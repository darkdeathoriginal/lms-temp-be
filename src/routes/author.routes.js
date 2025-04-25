// src/routes/author.routes.js
const express = require('express');
const authorController = require('../controllers/author.controller');
const { authenticate, isAdmin, isLibrarian, isAdminOrLibrarian } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/authors
 */

/**
 * @swagger
 * /api/v1/authors:
 *   post:
 *     summary: Create a new author (Admin/Librarian Only)
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/AuthorInput' } } }
 *     responses:
 *       201: { description: 'Author created', content: { application/json: { schema: { $ref: '#/components/schemas/Author' } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.post('/',
    authenticate,
    isAdminOrLibrarian,
    authorController.createAuthor
);

/**
 * @swagger
 * /api/v1/authors:
 *   get:
 *     summary: Retrieve a list of authors (Authenticated Users)
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'name', enum: [name, created_at, updated_at] }
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *       - { name: search, in: query, schema: { type: string }, description: 'Search term for author name or bio' }
 *     responses:
 *       200: { description: 'A paginated list of authors', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Author' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/',
    authenticate, // All authenticated users can view authors
    authorController.getAllAuthors
);

/**
 * @swagger
 * /api/v1/authors/{id}:
 *   get:
 *     summary: Retrieve a single author by ID (Authenticated Users)
 *     tags: [Authors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/AuthorIdPathParam' }
 *     responses:
 *       200: { description: 'Author details', content: { application/json: { schema: { $ref: '#/components/schemas/Author' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/:id',
    authenticate, // All authenticated users can view a specific author
    authorController.getAuthorById
);

/**
 * @swagger
 * /api/v1/authors/{id}:
 *   put:
 *     summary: Update an author by ID (Admin/Librarian Only)
 *     tags: [Authors]
 *     description: Updates author's name or bio. Cannot update associated book IDs via this endpoint.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/AuthorIdPathParam' }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/AuthorInput' } } } # Reusing input, ignores book_ids
 *     responses:
 *       200: { description: 'Author updated successfully', content: { application/json: { schema: { $ref: '#/components/schemas/Author' } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.put('/:id',
    authenticate,
    isAdminOrLibrarian,
    authorController.updateAuthor
);

/**
 * @swagger
 * /api/v1/authors/{id}:
 *   delete:
 *     summary: Delete an author by ID (Admin Only)
 *     tags: [Authors]
 *     description: Deletes an author. Requires Admin role. **Warning:** If books are associated with this author, the reference will be removed from the books automatically by the default logic in the controller (this might be slow if many books are affected). Alternatively, the controller logic might prevent deletion. Check controller implementation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/AuthorIdPathParam' }
 *     responses:
 *       204: { description: 'Author deleted successfully (No Content)' }
 *       400: { description: 'Bad Request - Cannot delete author if associated with books (depending on controller logic)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.delete('/:id',
    authenticate,
    isAdmin, // Only Admins can delete authors
    authorController.deleteAuthor
);

module.exports = router;