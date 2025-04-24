// src/controllers/genre.controller.js
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * components:
 *   schemas:
 *     Genre:
 *       # Already defined in swagger.js
 *     GenreInput:
 *       # Already defined in swagger.js
 *     PaginationInfo:
 *      # Already defined in swagger.js
 *   parameters:
 *      # Reusable parameters defined in swagger.js
 *      GenreIdPathParam:
 *        name: id
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the genre.
 */

/**
 * @controller GenreController
 */


/**
 * @method createGenre
 * @description Creates a new genre. Requires Admin or Librarian role.
 * @route POST /api/v1/genres
 * @access Admin, Librarian
 * @tag Genres
 */
exports.createGenre = async (req, res, next) => {
    try {
        const { name, description } = req.body;

        // Basic validation
        if (!name) {
            return res.status(400).json({ success: false, error: { message: 'Genre name is required.' } });
        }

        const newGenre = await prisma.genre.create({
            data: { name, description }
        });
        handleSuccess(res, newGenre, 201);
    } catch (error) {
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && error.meta?.target?.includes('name')) {
             return res.status(409).json({ success: false, error: { message: 'Genre name already exists.' } });
         }
        next(error); // Pass other errors to global handler
    }
};

/**
 * @method getAllGenres
 * @description Retrieves a paginated list of genres. Available to any authenticated user. Supports searching and sorting.
 * @route GET /api/v1/genres
 * @access Authenticated Users
 * @tag Genres
 */
exports.getAllGenres = async (req, res, next) => {
    try {
        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        const allowedSortBy = ['name', 'created_at', 'updated_at'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'name'; // Default sort by name
        const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

        // --- Filtering ---
        const { search } = req.query;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        // --- Database Query ---
        const [genres, totalGenres] = await prisma.$transaction([
            prisma.genre.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder }
            }),
            prisma.genre.count({ where }) // Count based on the same filters
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: genres,
            pagination: {
                totalItems: totalGenres,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalGenres / limit)
            }
        });
    } catch (error) {
         if (error instanceof Prisma.PrismaClientValidationError) { // Catch validation errors (e.g., invalid query params)
            return res.status(400).json({ success: false, error: { message: "Invalid query parameter format." } });
         }
        next(error);
    }
};

/**
 * @method getGenreById
 * @description Fetches details of a specific genre by its ID. Available to any authenticated user.
 * @route GET /api/v1/genres/{id}
 * @access Authenticated Users
 * @tag Genres
 */
exports.getGenreById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const genre = await prisma.genre.findUniqueOrThrow({
             where: { genre_id: id }
        });
        handleSuccess(res, genre);
    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};

/**
 * @method updateGenre
 * @description Updates details of an existing genre. Requires Admin or Librarian role.
 * @route PUT /api/v1/genres/{id}
 * @access Admin, Librarian
 * @tag Genres
 */
exports.updateGenre = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        // Basic validation
        if (Object.keys(req.body).length === 0 || (name === undefined && description === undefined)) {
             return res.status(400).json({ success: false, error: { message: 'No update data provided (name or description required).' } });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;


        const updatedGenre = await prisma.genre.update({
            where: { genre_id: id },
            data: updateData,
        });
        handleSuccess(res, updatedGenre);
    } catch (error) {
         if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
                return res.status(409).json({ success: false, error: { message: 'Genre name already exists.' } });
            }
            // P2025 (NotFound) handled by global handler
         }
        next(error);
    }
};

/**
 * @method deleteGenre
 * @description Deletes a genre. Requires Admin role only. Note: This does not automatically update books referencing this genre.
 * @route DELETE /api/v1/genres/{id}
 * @access Admin
 * @tag Genres
 */
exports.deleteGenre = async (req, res, next) => {
    const { id } = req.params;
    try {
        // IMPORTANT CAVEAT: Deleting a genre ID stored in a Book's genre_ids array
        // is NOT automatically handled by Prisma or the database in this schema design.
        // You would need to manually implement logic here (or elsewhere) to find all books
        // using this genreId and remove it from their genre_ids array before deleting the genre.
        // This can be complex and potentially slow.
        // Consider if genres should be soft-deleted or if a proper many-to-many relation is better.

        await prisma.$transaction(async (tx) => {
            // --- Optional: Find books using this genre ---
            const booksUsingGenre = await tx.book.findMany({
                where: { genre_ids: { has: id } },
                select: { book_id: true, title: true }
            });

            if (booksUsingGenre.length > 0) {
                // Option 1: Prevent deletion
                // throw new Error(`Cannot delete genre: It is currently used by ${booksUsingGenre.length} book(s) (e.g., "${booksUsingGenre[0].title}"). Remove genre from books first.`);

                // Option 2: Automatically remove the genre from books (Use with caution!)
                console.warn(`Genre ${id} is used by ${booksUsingGenre.length} book(s). Removing reference...`);
                 for (const book of booksUsingGenre) {
                     const currentBookData = await tx.book.findUnique({
                         where: { book_id: book.book_id },
                         select: { genre_ids: true }
                     });
                     const updatedGenreIds = currentBookData.genre_ids.filter(gid => gid !== id);
                     await tx.book.update({
                         where: { book_id: book.book_id },
                         data: { genre_ids: updatedGenreIds }
                     });
                 }
            }

            // --- Delete the genre ---
            await tx.genre.delete({
                where: { genre_id: id }
            });
        }); // End transaction

        res.status(204).send(); // No content on successful delete
    } catch (error) {
         // Catch specific error from transaction
         if (error instanceof Error && error.message.startsWith('Cannot delete genre:')) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};