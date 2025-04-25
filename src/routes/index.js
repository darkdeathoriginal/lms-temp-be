// src/routes/index.js - Main Router Aggregator
const express = require('express');

// Import all specific routers
const libraryRoutes = require('./library.routes');
const userRoutes = require('./user.routes');
const genreRoutes = require('./genre.routes');
const authorRoutes = require('./author.routes');
const bookRoutes = require('./book.routes');
const policyRoutes = require('./policy.routes');
const borrowTransactionRoutes = require('./borrowTransaction.routes');
const reservationRoutes = require('./reservation.routes');
const wishlistRoutes = require('./wishlist.routes');
const reviewRoutes = require('./review.routes');
const adminRoutes = require('./admin.routes');
// const ticketRoutes = require('./ticket.routes');
// const fineRoutes = require('./fine.routes');
// const documentUploadRoutes = require('./documentUpload.routes');

const router = express.Router();

// Define the base path for V1 of the API
const API_PREFIX = '/api/v1';

// --- Health Check Route ---
// Good practice for load balancers, etc.
// Mounted directly under root before the prefix
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check API Health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: UP
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});


// --- Mount Entity Routes under the API Prefix ---
router.use(`${API_PREFIX}/libraries`, libraryRoutes);
router.use(`${API_PREFIX}/users`, userRoutes);
router.use(`${API_PREFIX}/genres`, genreRoutes);
router.use(`${API_PREFIX}/authors`, authorRoutes);
router.use(`${API_PREFIX}/books`, bookRoutes);
router.use(`${API_PREFIX}/policies`, policyRoutes);
router.use(`${API_PREFIX}/borrow-transactions`, borrowTransactionRoutes);
router.use(`${API_PREFIX}/reservations`, reservationRoutes);
router.use(`${API_PREFIX}/wishlists`, wishlistRoutes);
router.use(`${API_PREFIX}/reviews`, reviewRoutes);
router.use(`${API_PREFIX}/admin`, adminRoutes);
// router.use(`${API_PREFIX}/tickets`, ticketRoutes);
// router.use(`${API_PREFIX}/fines`, fineRoutes);
// router.use(`${API_PREFIX}/document-uploads`, documentUploadRoutes);

// Add tags for Swagger documentation sections if not defined in controllers
/**
 * @swagger
 * tags:
 *   - name: Libraries
 *     description: Operations related to libraries
 *   - name: Users
 *     description: User management (Admins, Librarians, Members)
 *   - name: Genres
 *     description: Book genre management
 *   - name: Authors
 *     description: Author management
 *   - name: Books
 *     description: Book catalog and inventory management
 *   - name: Policies
 *     description: Library policy configuration
 *   - name: Borrow Transactions
 *     description: Tracking book borrowing and returns
 *   - name: Reservations
 *     description: Managing book reservations
 *   - name: Wishlists
 *     description: User wishlists for books
 *   - name: Reviews
 *     description: User reviews and ratings for books
 *   - name: Tickets
 *     description: User support tickets
 *   - name: Fines
 *     description: Managing fines for overdue books
 *   - name: Document Uploads
 *     description: Handling document uploads (if needed)
 *   - name: Health
 *     description: API health status check
 */

module.exports = router;