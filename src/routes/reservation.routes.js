// src/routes/reservation.routes.js
const express = require('express');
const reservationController = require('../controllers/reservation.controller');
const { authenticate, isMember, isAdminOrLibrarian, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/reservations
 */

/**
 * @swagger
 * /api/v1/reservations:
 *   post:
 *     summary: Create a new reservation (Member Only)
 *     tags: [Reservations]
 *     description: Allows an authenticated member to reserve a book. Reservation expiry is set based on library policy.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ReservationInput' } } }
 *     responses:
 *       201: { description: 'Reservation created successfully', content: { application/json: { schema: { $ref: '#/components/schemas/Reservation' } } } }
 *       400: { description: 'Bad Request - Cannot reserve already borrowed book, etc.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' } # If role is not Member
 *       404: { description: 'Not Found - User, Book, or Policy not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       409: { description: 'Conflict - Already reserved this book', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.post('/',
    authenticate,
    isMember, // Only Members can create reservations for themselves
    reservationController.createReservation
);

/**
 * @swagger
 * /api/v1/reservations:
 *   get:
 *     summary: Retrieve a list of reservations (Authenticated Users)
 *     tags: [Reservations]
 *     description: Gets a paginated list of reservations. Admins/Librarians see all, Members see their own. Supports filtering.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'reserved_at', enum: [reserved_at, expires_at] }
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
 *       - name: expired
 *         in: query
 *         schema: { type: boolean }
 *         description: Filter by expiry status (true=expired, false=active).
 *     responses:
 *       200: { description: 'A paginated list of reservations', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Reservation' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to filter by another user ID', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/',
    authenticate, // All authenticated users can potentially access this...
    // RBAC filtering happens inside the controller
    reservationController.getAllReservations
);

/**
 * @swagger
 * /api/v1/reservations/{reservationId}:
 *   get:
 *     summary: Retrieve a single reservation by ID (Authenticated Users)
 *     tags: [Reservations]
 *     description: Gets details of a specific reservation. Admins/Librarians see any, Members see only their own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/ReservationIdPathParam' }
 *     responses:
 *       200: { description: 'Reservation details', content: { application/json: { schema: { $ref: '#/components/schemas/Reservation' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to view another user reservation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/:reservationId',
    authenticate, // All authenticated users can potentially access this...
    // RBAC check happens inside the controller
    reservationController.getReservationById
);

/**
 * @swagger
 * /api/v1/reservations/{reservationId}:
 *   delete:
 *     summary: Cancel/Delete a reservation (Member, Librarian, Admin)
 *     tags: [Reservations]
 *     description: Deletes a reservation. Members can delete their own, Admins/Librarians can delete any. Updates book and user records accordingly.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/ReservationIdPathParam' }
 *     responses:
 *       204: { description: 'Reservation deleted successfully (No Content)' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to delete another user reservation', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.delete('/:reservationId',
    authenticate,
    authorize(['Member', 'Librarian', 'Admin']), // Allow multiple roles
    // Ownership check for 'Member' happens inside the controller
    reservationController.deleteReservation
);


module.exports = router;