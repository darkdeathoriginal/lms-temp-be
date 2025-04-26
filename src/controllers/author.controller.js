// src/controllers/author.controller.js
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * components:
 *   schemas:
 *     Author:
 *       # Already defined in swagger.js
 *     AuthorInput:
 *       # Already defined in swagger.js
 *     PaginationInfo:
 *      # Already defined in swagger.js
 *   parameters:
 *      AuthorIdPathParam:
 *        name: id
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the author.
 */

/**
 * @controller AuthorController
 */

/**
 * @method createAuthor
 * @description Creates a new author. Requires Admin or Librarian role. The `book_ids` field is typically managed via Book endpoints.
 * @route POST /api/v1/authors
 * @access Admin, Librarian
 * @tag Authors
 */
exports.createAuthor = async (req, res, next) => {
    try {
        const { name, bio } = req.body; // book_ids are ignored here

        // Basic validation
        if (!name) {
            return res.status(400).json({ success: false, error: { message: 'Author name is required.' } });
        }

        // Consider adding a check if author name already exists if desired, though not enforced by schema unique constraint.

        const newAuthor = await prisma.author.create({
            data: {
                name,
                bio,
                // book_ids defaults to [] via schema
            }
        });
        handleSuccess(res, newAuthor, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * @method getAllAuthors
 * @description Retrieves a paginated list of authors. Available to any authenticated user. Supports searching and sorting.
 * @route GET /api/v1/authors
 * @access Authenticated Users
 * @tag Authors
 */
exports.getAllAuthors = async (req, res, next) => {
    try {
        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['name', 'created_at', 'updated_at'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'name';
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Filtering ---
        const { search } = req.query;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { bio: { contains: search, mode: 'insensitive' } }, // Search in bio as well
            ];
        }

        // --- Database Query ---
        const [authors, totalAuthors] = await prisma.$transaction([
            prisma.author.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder }
            }),
            prisma.author.count({ where })
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: authors,
            pagination: {
                totalItems: totalAuthors,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalAuthors / limit)
            }
        });
    } catch (error) {
         if (error instanceof Prisma.PrismaClientValidationError) {
            return res.status(400).json({ success: false, error: { message: "Invalid query parameter format." } });
         }
        next(error);
    }
};

/**
 * @method getAuthorById
 * @description Fetches details of a specific author by ID. Available to any authenticated user.
 * @route GET /api/v1/authors/{id}
 * @access Authenticated Users
 * @tag Authors
 */
exports.getAuthorById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const author = await prisma.author.findUniqueOrThrow({
             where: { author_id: id }
             // Optional: Include related books? Might be very large. Better to have a separate endpoint like /authors/{id}/books
             // include: { books: { where: { author_ids: { has: id }}}} // This query is inefficient with array fields
        });
        handleSuccess(res, author);
    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};

/**
 * @method updateAuthor
 * @description Updates details of an existing author. Requires Admin or Librarian role. `book_ids` should not be updated here.
 * @route PUT /api/v1/authors/{id}
 * @access Admin, Librarian
 * @tag Authors
 */
exports.updateAuthor = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, bio, book_ids, ...otherData } = req.body; // Explicitly ignore book_ids and other unexpected fields

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (bio !== undefined) updateData.bio = bio;

        if (Object.keys(updateData).length === 0) {
             return res.status(400).json({ success: false, error: { message: 'No update data provided (name or bio required).' } });
        }

        const updatedAuthor = await prisma.author.update({
            where: { author_id: id },
            data: updateData,
        });
        handleSuccess(res, updatedAuthor);
    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};

/**
 * @method deleteAuthor
 * @description Deletes an author. Requires Admin role only. Note: This does not automatically update books referencing this author.
 * @route DELETE /api/v1/authors/{id}
 * @access Admin
 * @tag Authors
 */
exports.deleteAuthor = async (req, res, next) => {
    const { id } = req.params;
    try {
         // IMPORTANT CAVEAT: Similar to Genres, deleting an Author does not automatically
         // update the `author_ids` array in associated Books. Manual cleanup is required.
         // This schema design makes deleting authors complex if data integrity is critical.

        await prisma.$transaction(async (tx) => {
            // --- Optional: Find books by this author ---
             const booksByAuthor = await tx.book.findMany({
                 where: { author_ids: { has: id } },
                 select: { book_id: true, title: true }
             });

             if (booksByAuthor.length > 0) {
                 // Option 1: Prevent deletion
                 // throw new Error(`Cannot delete author: Author is associated with ${booksByAuthor.length} book(s) (e.g., "${booksByAuthor[0].title}"). Remove author from books first.`);

                 // Option 2: Automatically remove the author from books (Use with caution!)
                  console.warn(`Author ${id} is associated with ${booksByAuthor.length} book(s). Removing reference...`);
                  for (const book of booksByAuthor) {
                      const currentBookData = await tx.book.findUnique({
                          where: { book_id: book.book_id },
                          select: { author_ids: true }
                      });
                      const updatedAuthorIds = currentBookData.author_ids.filter(aid => aid !== id);
                      await tx.book.update({
                          where: { book_id: book.book_id },
                          data: { author_ids: updatedAuthorIds }
                      });
                  }
             }

            // --- Delete the author ---
            await tx.author.delete({
                where: { author_id: id }
            });
        }); // End transaction

        res.status(204).send(); // No content on successful delete
    } catch (error) {
         // Catch specific error from transaction
         if (error instanceof Error && error.message.startsWith('Cannot delete author:')) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};