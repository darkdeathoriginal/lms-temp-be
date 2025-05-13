// src/routes/fine.routes.js
const express = require('express');
const fineController = require('../controllers/fine.controller');
const { authenticate, isMember, isAdmin, isLibrarian, isAdminOrLibrarian, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/fines
 */

/**
 * @swagger
 * /api/v1/fines:
 *   get:
 *     summary: Retrieve a list of fines (Authenticated Users)
 *     tags: [Fines]
 *     description: Gets a paginated list of fines. Admins/Librarians see all or filtered by params. Members see their own (defaults to unpaid).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'fine_date', enum: [fine_date, amount, is_paid, updated_at] }
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *       - name: userId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Filter by User ID (Admin/Librarian only).
 *       - name: bookId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Filter by Book ID.
 *       - name: libraryId
 *         in: query
 *         schema: { type: string, format: uuid }
 *         description: Filter by Library ID (Admin/Librarian only).
 *       - name: isPaid
 *         in: query
 *         schema: { type: boolean }
 *         description: Filter by payment status (true/false). For Members, defaults to false if not 'true'.
 *     responses:
 *       200: { description: 'A paginated list of fines', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/FineWithDetails' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to filter/view other users fines inappropriately', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/',
    authenticate,
    // RBAC filtering logic is within the controller
    fineController.getAllFines
);

/**
 * @swagger
 * /api/v1/fines/user/{userId}:
 *   get:
 *     summary: Retrieve fines for a specific user (Member own, Admin/Librarian any)
 *     tags: [Fines]
 *     description: Gets a paginated list of fines for a given User ID. Members can only access their own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/UserIdPathParam' }
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'fine_date', enum: [fine_date, amount, is_paid] }
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *       - name: isPaid
 *         in: query
 *         schema: { type: boolean }
 *         description: Filter by payment status (true/false).
 *     responses:
 *       200: { description: "A paginated list of the user's fines", content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/FineWithDetails' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to view another user fines', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/user/:userId',
    authenticate,
    // RBAC and ownership check is within the controller
    fineController.getFinesForUser
);


/**
 * @swagger
 * /api/v1/fines/{fineId}:
 *   get:
 *     summary: Retrieve a single fine by ID (Authenticated Users - own for Member)
 *     tags: [Fines]
 *     description: Gets details of a specific fine. Admins/Librarians see any, Members see only their own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/FineIdPathParam' }
 *     responses:
 *       200: { description: 'Fine details', content: { application/json: { schema: { $ref: '#/components/schemas/FineWithDetails' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to view another user fine', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/:fineId',
    authenticate,
    // RBAC and ownership check is within the controller
    fineController.getFineById
);

/**
 * @swagger
 * /api/v1/fines/{fineId}/pay:
 *   put:
 *     summary: Mark a fine as paid (Admin/Librarian Only)
 *     tags: [Fines]
 *     description: Updates the status of a fine to 'paid'. This action is typically performed by library staff.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/FineIdPathParam' }
 *     responses:
 *       200: { description: 'Fine marked as paid successfully', content: { application/json: { schema: { $ref: '#/components/schemas/FineWithDetails' } } } }
 *       400: { description: 'Bad Request - Fine already paid', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.put('/:fineId/pay',
    authenticate,
    isAdminOrLibrarian, // Only Admins/Librarians can mark fines as paid
    fineController.markFineAsPaid
);

module.exports = router;