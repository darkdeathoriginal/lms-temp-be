// src/routes/library.routes.js
const express = require('express');
const libraryController = require('../controllers/library.controller');
// --- Import Auth Middleware ---
const { authenticate, isAdmin, isAdminOrLibrarian } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/libraries
 */

/**
 * @swagger
 * /api/v1/libraries:
 *   post:
 *     summary: Create a new library (Admin Only)
 *     tags: [Libraries]
 *     security: # --- Add Security Requirement ---
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/LibraryInput' } } }
 *     responses:
 *       201: { description: 'Library created', content: { application/json: { schema: { $ref: '#/components/schemas/Library' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' } # Add Auth responses
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }    # Add Auth responses
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.post('/',
    authenticate, // 1. Check for valid token
    isAdmin,      // 2. Check if user role is 'Admin'
    libraryController.createLibrary
);

/**
 * @swagger
 * /api/v1/libraries:
 *   get:
 *     summary: Retrieve a list of libraries (Authenticated Users)
 *     tags: [Libraries]
 *     security: # --- Add Security Requirement ---
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - { $ref: '#/components/parameters/SortByQueryParam', schema: { type: string, default: 'name', enum: [name, city, state, country, created_at] } } # Specify valid sort fields
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *       - { name: search, in: query, schema: { type: string }, description: 'Search term for library name or city' }
 *     responses:
 *       200: { description: 'List of libraries', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Library' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/',
    authenticate, // Requires any logged-in user
    libraryController.getAllLibraries
);

/**
 * @swagger
 * /api/v1/libraries/{id}:
 *   get:
 *     summary: Retrieve a single library by ID (Authenticated Users)
 *     tags: [Libraries]
 *     security: # --- Add Security Requirement ---
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid }, description: 'Library ID' }
 *     responses:
 *       200: { description: 'Library details', content: { application/json: { schema: { $ref: '#/components/schemas/Library' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/:id',
    authenticate, // Requires any logged-in user
    libraryController.getLibraryById
);

/**
 * @swagger
 * /api/v1/libraries/{id}:
 *   put:
 *     summary: Update a library by ID (Admin Only)
 *     tags: [Libraries]
 *     security: # --- Add Security Requirement ---
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid }, description: 'Library ID' }
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/LibraryInput' } } }
 *     responses:
 *       200: { description: 'Library updated', content: { application/json: { schema: { $ref: '#/components/schemas/Library' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.put('/:id',
    authenticate,
    isAdmin,
    libraryController.updateLibrary
);

/**
 * @swagger
 * /api/v1/libraries/{id}:
 *   delete:
 *     summary: Delete a library by ID (Admin Only)
 *     tags: [Libraries]
 *     security: # --- Add Security Requirement ---
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid }, description: 'Library ID' }
 *     responses:
 *       204: { description: 'Library deleted successfully' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.delete('/:id',
    authenticate,
    isAdmin,
    libraryController.deleteLibrary
);

module.exports = router;