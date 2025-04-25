// src/controllers/library.controller.js
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function for common responses (optional)
const handleNotFound = (res, entity = 'Resource') => res.status(404).json({ success: false, error: { message: `${entity} not found.` } });
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);
const { authenticate, isAdmin, isAdminOrLibrarian } = require('../middleware/auth.middleware');



/**
 * @swagger
 * /api/v1/libraries:
 *   post:
 *     summary: Create a new library
 *     tags: [Libraries]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LibraryInput'
 *     responses:
 *       201:
 *         description: Library created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Library'
 *       400:
 *         $ref: '#/components/schemas/BadRequestResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
exports.createLibrary = async (req, res, next) => {
  try {
    const newLibrary = await prisma.library.create({
      data: req.body,
    });
    handleSuccess(res, newLibrary, 201);
  } catch (error) {
    next(error); // Pass error to the global error handler
  }
};

/**
 * @swagger
 * /api/v1/libraries:
 *   get:
 *     summary: Retrieve a list of libraries
 *     tags: [Libraries]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Items per page
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, default: 'created_at' }
 *         description: Field to sort by (e.g., name, created_at)
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: 'desc' }
 *         description: Sort order
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search term for library name or city (example)
 *     responses:
 *       200:
 *         description: A list of libraries with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Library'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                      totalItems: { type: integer }
 *                      currentPage: { type: integer }
 *                      itemsPerPage: { type: integer }
 *                      totalPages: { type: integer }
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
exports.getAllLibraries = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
    const searchTerm = req.query.search;

    const where = searchTerm
        ? {
            OR: [
                { name: { contains: searchTerm, mode: 'insensitive' } },
                { city: { contains: searchTerm, mode: 'insensitive' } },
            ],
          }
        : {};

    const [libraries, totalLibraries] = await prisma.$transaction([
        prisma.library.findMany({
            where,
            skip: skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder }
        }),
        prisma.library.count({ where })
    ]);


    handleSuccess(res, {
        data: libraries,
        pagination: {
            totalItems: totalLibraries,
            currentPage: page,
            itemsPerPage: limit,
            totalPages: Math.ceil(totalLibraries / limit)
        }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/v1/libraries/{id}:
 *   get:
 *     summary: Retrieve a single library by ID
 *     tags: [Libraries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The library ID
 *     responses:
 *       200:
 *         description: Library details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Library'
 *       404:
 *         $ref: '#/components/schemas/NotFoundResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
exports.getLibraryById = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Use findUniqueOrThrow to automatically handle not found,
    // letting the errorHandler catch the P2025 error.
    const library = await prisma.library.findUniqueOrThrow({
      where: { library_id: id },
    });
    handleSuccess(res, library);
  } catch (error) {
    // The errorHandler will catch Prisma's P2025 and return a 404
    next(error);
  }
};

/**
 * @swagger
 * /api/v1/libraries/{id}:
 *   put:
 *     summary: Update a library by ID
 *     tags: [Libraries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The library ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LibraryInput' # Can reuse input or define a specific update schema
 *     responses:
 *       200:
 *         description: Library updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Library'
 *       400:
 *         $ref: '#/components/schemas/BadRequestResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
exports.updateLibrary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updatedLibrary = await prisma.library.update({
      where: { library_id: id },
      data: req.body, // Ensure only valid fields are passed from req.body
    });
    handleSuccess(res, updatedLibrary);
  } catch (error) {
    // P2025 (Record to update not found) will be caught by errorHandler
    next(error);
  }
};

/**
 * @swagger
 * /api/v1/libraries/{id}:
 *   delete:
 *     summary: Delete a library by ID
 *     tags: [Libraries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The library ID
 *     responses:
 *       204:
 *         description: Library deleted successfully (No Content)
 *       404:
 *         $ref: '#/components/schemas/NotFoundResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
exports.deleteLibrary = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.library.delete({
      where: { library_id: id },
    });
    res.status(204).send(); // No content response for successful DELETE
  } catch (error) {
     // P2025 (Record to delete not found) will be caught by errorHandler
    next(error);
  }
};

// --- Repeat this structure for ALL other models ---
// (User, Book, Genre, Author, Policy, BorrowTransaction, Reservation, Wishlist, Review, Ticket, Fine, DocumentUpload)
// Remember to:
// 1. Adjust Prisma model names (`prisma.user`, `prisma.book`, etc.)
// 2. Adjust Swagger tags, summaries, parameters, requestBody refs, and response refs.
// 3. Use the correct Input/Output schemas defined in swagger.js.
// 4. Implement specific logic (e.g., checking book availability before borrowing, calculating fines, updating array fields).
// 5. Handle relationships correctly (e.g., ensuring `library_id` exists when creating a user).
// 6. Implement validation for CHECK constraints (e.g., review rating 1-5).