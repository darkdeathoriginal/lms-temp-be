// src/routes/borrowTransaction.routes.js
const express = require('express');
const borrowTransactionController = require('../controllers/borrowTransaction.controller');
const { authenticate, isMember, isLibrarian, isAdminOrLibrarian, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/borrow-transactions
 */

/**
 * @swagger
 * /api/v1/borrow-transactions:
 *   post:
 *     summary: Borrow a book (Member Only)
 *     tags: [Borrow Transactions]
 *     description: Allows an authenticated member to borrow an available book, respecting library policies and limits.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/BorrowInput' } } }
 *     responses:
 *       201: { description: 'Book borrowed successfully', content: { application/json: { schema: { $ref: '#/components/schemas/BorrowTransaction' } } } }
 *       400: { description: 'Bad Request - Book not available, user limit reached, already borrowed, etc.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' } # If role is not Member
 *       404: { description: 'Not Found - User, Book, or Policy not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.post('/',
    authenticate,
    isMember, // Only members can initiate a borrow for themselves via this endpoint
    borrowTransactionController.borrowBook
);

/**
 * @swagger
 * /api/v1/borrow-transactions/{borrowId}/return:
 *   put:
 *     summary: Return a borrowed book (Member or Librarian)
 *     tags: [Borrow Transactions]
 *     description: Marks a book as returned. Members can return their own books, Librarians can return any book (within their scope if implemented). Generates a fine if overdue.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/BorrowIdPathParam' }
 *     responses:
 *       200: { description: 'Book returned successfully. Includes transaction details and any fine generated.', content: { application/json: { schema: { $ref: '#/components/schemas/ReturnResponse' } } } }
 *       400: { description: 'Bad Request - Book already returned, or member trying to return wrong book.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { description: 'Not Found - Borrow transaction or required Policy not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.put('/:borrowId/return',
    authenticate,
    authorize(['Member', 'Librarian']), // Allow both Members and Librarians
    borrowTransactionController.returnBook
);

/**
 * @swagger
 * /api/v1/borrow-transactions:
 *   get:
 *     summary: Retrieve a list of borrow transactions (Authenticated Users)
 *     tags: [Borrow Transactions]
 *     description: Gets a paginated list of borrow transactions. Admins/Librarians see all, Members see their own. Supports filtering.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'borrow_date', enum: [borrow_date, return_date, status] }
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
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [borrowed, returned, overdue] }
 *         description: Filter by transaction status.
 *       # - name: libraryId # Add if filtering by library is implemented
 *       #   in: query
 *       #   schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: 'A paginated list of borrow transactions', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/BorrowTransaction' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/schemas/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to filter by another user ID', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/',
    authenticate, // All authenticated users can potentially access this...
    // RBAC filtering happens inside the controller based on role
    borrowTransactionController.getAllBorrowTransactions
);

/**
 * @swagger
 * /api/v1/borrow-transactions/{borrowId}:
 *   get:
 *     summary: Retrieve a single borrow transaction by ID (Authenticated Users)
 *     tags: [Borrow Transactions]
 *     description: Gets details of a specific borrow transaction. Admins/Librarians see any, Members see only their own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/BorrowIdPathParam' }
 *     responses:
 *       200: { description: 'Borrow transaction details', content: { application/json: { schema: { $ref: '#/components/schemas/BorrowTransaction' } } } } # Include fine details if possible
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { description: 'Forbidden - Member trying to view another user transaction', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { $ref: '#/components/schemas/NotFoundResponse' }
 *       500: { $ref: '#/components/schemas/ServerErrorResponse' }
 */
router.get('/:borrowId',
    authenticate, // All authenticated users can potentially access this...
    // RBAC check happens inside the controller based on role and transaction ownership
    borrowTransactionController.getBorrowTransactionById
);

// DELETE endpoint is intentionally omitted as transactions are typically kept for history.

module.exports = router;