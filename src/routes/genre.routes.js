// src/routes/genre.routes.js
const express = require('express');
const genreController = require('../controllers/genre.controller');
const { authenticate, isAdmin, isLibrarian, isAdminOrLibrarian } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/genres
 */

/**
 * @swagger
 * /api/v1/genres:
 *   post:
 *     summary: Create a new genre (Admin/Librarian Only)
 *     tags: [Genres]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/GenreInput' } } }
 *     responses:
 *       201: { description: 'Genre created', content: { application/json: { schema: { $ref: '#/components/schemas/Genre' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       409: { description: 'Conflict - Genre name already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.post('/',
    authenticate,
    isAdminOrLibrarian,
    genreController.createGenre
);

/**
 * @swagger
 * /api/v1/genres:
 *   get:
 *     summary: Retrieve a list of genres (Authenticated Users)
 *     tags: [Genres]
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
 *       - { name: search, in: query, schema: { type: string }, description: 'Search term for genre name or description' }
 *     responses:
 *       200: { description: 'A paginated list of genres', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Genre' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/',
    authenticate, // All authenticated users can view genres
    genreController.getAllGenres
);

/**
 * @swagger
 * /api/v1/genres/{id}:
 *   get:
 *     summary: Retrieve a single genre by ID (Authenticated Users)
 *     tags: [Genres]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/GenreIdPathParam' }
 *     responses:
 *       200: { description: 'Genre details', content: { application/json: { schema: { $ref: '#/components/schemas/Genre' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/:id',
    authenticate, // All authenticated users can view a specific genre
    genreController.getGenreById
);

/**
 * @swagger
 * /api/v1/genres/{id}:
 *   put:
 *     summary: Update a genre by ID (Admin/Librarian Only)
 *     tags: [Genres]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/GenreIdPathParam' }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/GenreInput' } } } # Can send partial data (name or description or both)
 *     responses:
 *       200: { description: 'Genre updated successfully', content: { application/json: { schema: { $ref: '#/components/schemas/Genre' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       409: { description: 'Conflict - Genre name already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.put('/:id',
    authenticate,
    isAdminOrLibrarian,
    genreController.updateGenre
);

/**
 * @swagger
 * /api/v1/genres/{id}:
 *   delete:
 *     summary: Delete a genre by ID (Admin Only)
 *     tags: [Genres]
 *     description: Deletes a genre. Requires Admin role. **Warning:** If books currently use this genre, the reference will be removed from the books automatically by the default logic in the controller (this might be slow if many books are affected). Alternatively, the controller logic might prevent deletion if books are using it. Check controller implementation for details.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/GenreIdPathParam' }
 *     responses:
 *       204: { description: 'Genre deleted successfully (No Content)' }
 *       400: { description: 'Bad Request - Cannot delete genre if it is in use (depending on controller logic)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.delete('/:id',
    authenticate,
    isAdmin, // Only Admins can delete genres
    genreController.deleteGenre
);

module.exports = router;