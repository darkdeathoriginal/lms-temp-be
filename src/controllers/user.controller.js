// src/controllers/user.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper for success responses (optional)
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     description: >
 *       Creates a new user record. The `user_id` **must** be provided and should typically
 *       correspond to an ID from an external authentication system (e.g., Supabase Auth, Firebase Auth).
 *       This API does not handle user authentication or password management.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content: { application/json: { schema: { $ref: '#/components/schemas/User' } } }
 *       400:
 *         description: Bad Request - Missing required fields, invalid input, or referenced library not found.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       409:
 *         description: Conflict - Email address already exists.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { success: false, error: { message: "Email already exists." } } } }
 *       500:
 *         $ref: '#/components/responses/ServerErrorResponse'
 */
exports.createUser = async (req, res, next) => {
    try {
        const { user_id, library_id, name, email, role } = req.body;

        // --- Basic Input Validation ---
        if (!user_id || !library_id || !name || !email || !role) {
            // Using return here to stop execution before hitting prisma query
            return res.status(400).json({ success: false, error: { message: 'Missing required fields: user_id, library_id, name, email, role' } });
        }
        // Add more specific validation if needed (e.g., email format, role enum check - though Prisma handles enum)

        // --- Check if referenced library exists ---
        // It's better to check before attempting the create to give a clearer error.
        // Prisma's P2003 on library_id would also work but the error message is less specific.
        const libraryExists = await prisma.library.findUnique({
            where: { library_id: library_id },
            select: { library_id: true } // Only select necessary field
        });
        if (!libraryExists) {
             return res.status(400).json({ success: false, error: { message: `Referenced library with ID ${library_id} not found.` } });
        }

        // --- Attempt to create user ---
        const newUser = await prisma.user.create({
            data: {
                user_id, // Provided from input
                library_id,
                name,
                email,
                role,
                is_active: req.body.is_active ?? true, // Default to true if not provided
                // Array fields usually managed by other endpoints
            },
        });
        handleSuccess(res, newUser, 201);

    } catch (error) {
        // --- Specific Error Handling ---
        if (error.code === 'P2002') { // Unique constraint failed
             if (error.meta?.target?.includes('email')) {
                 return res.status(409).json({ success: false, error: { message: 'Email address already exists.' } });
             }
             if (error.meta?.target?.includes('user_id')) {
                 // This technically shouldn't happen if user_id is always unique from auth provider,
                 // but handle it just in case.
                 return res.status(409).json({ success: false, error: { message: 'User ID already exists.' } });
             }
        }
        // Let the global handler manage other errors (P2003 for library if check removed, connection errors etc.)
        next(error);
    }
};

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Retrieve a list of users
 *     tags: [Users]
 *     description: Fetches a paginated list of users with filtering and sorting options.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1, minimum: 1 }
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1, maximum: 100 }
 *         description: Number of users to return per page.
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, default: 'created_at', enum: [name, email, role, created_at, updated_at] }
 *         description: Field to sort the results by.
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, default: 'desc', enum: [asc, desc] }
 *         description: Order to sort the results in.
 *       - in: query
 *         name: libraryId
 *         schema: { type: string, format: uuid }
 *         description: Filter users belonging to a specific library ID.
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [Admin, Librarian, Member] }
 *         description: Filter users by their role.
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *         description: Filter users by their active status.
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search term to filter users by name or email (case-insensitive).
 *     responses:
 *       200:
 *         description: A paginated list of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationInfo' # Define PaginationInfo schema in swagger.js
 *       400:
 *         description: Bad Request - Invalid query parameters (e.g., non-integer limit).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       500:
 *         $ref: '#/components/responses/ServerErrorResponse'
 */
exports.getAllUsers = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1); // Ensure page >= 1
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10)); // Ensure 1 <= limit <= 100
        const skip = (page - 1) * limit;

        // Validate sortBy and sortOrder
        const allowedSortBy = ['name', 'email', 'role', 'created_at', 'updated_at'];
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'created_at';
        const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

        const { libraryId, role, isActive, search } = req.query;

        // Build the 'where' clause for filtering
        const where = {};
        if (libraryId) where.library_id = libraryId;
        if (role) where.role = role; // Assumes role query matches enum exactly
        if (isActive !== undefined) where.is_active = isActive === 'true'; // Convert query string to boolean
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Perform concurrent count and findMany using a transaction
        const [users, totalUsers] = await prisma.$transaction([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder }
            }),
            prisma.user.count({ where })
        ]);

        handleSuccess(res, {
            data: users,
            pagination: {
                totalItems: totalUsers,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalUsers / limit)
            }
        });
    } catch (error) {
        // Handle potential errors from invalid query params if not caught earlier
        if (error instanceof TypeError) { // e.g., if parseInt fails badly, though unlikely here
            return res.status(400).json({ success: false, error: { message: 'Invalid query parameter format.' }})
        }
        next(error);
    }
};


/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Retrieve a single user by ID
 *     tags: [Users]
 *     description: Fetches the details of a specific user using their unique ID.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The unique identifier of the user (user_id).
 *     responses:
 *       200:
 *         description: User details found successfully.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/User' } } }
 *       404:
 *         $ref: '#/components/responses/NotFoundResponse'
 *       500:
 *         $ref: '#/components/responses/ServerErrorResponse'
 */
exports.getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Use findUniqueOrThrow for concise handling of not found cases
        const user = await prisma.user.findUniqueOrThrow({
             where: { user_id: id }
        });
        handleSuccess(res, user);
    } catch (error) {
        // Let the global error handler catch P2025 (NotFound) from findUniqueOrThrow
        next(error);
    }
};

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update a user by ID
 *     tags: [Users]
 *     description: Updates details for an existing user. `user_id` cannot be changed. Array fields like `borrowed_book_ids` are typically managed by dedicated borrow/return endpoints.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The unique identifier of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object # Consider defining a specific UserUpdateInput schema
 *             properties:
 *                name: { type: string }
 *                email: { type: string, format: email }
 *                role: { type: string, enum: [Admin, Librarian, Member] }
 *                is_active: { type: boolean }
 *                library_id: { type: string, format: uuid, description: "Optional: Transfer user to a different library. Ensure the target library exists." }
 *             example:
 *                name: "Jane Doe Updated"
 *                is_active: true
 *                role: "Member"
 *     responses:
 *       200:
 *         description: User updated successfully.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/User' } } }
 *       400:
 *         description: Bad Request - Invalid input data or target library does not exist.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       404:
 *         $ref: '#/components/responses/NotFoundResponse'
 *       409:
 *         description: Conflict - Provided email address already exists for another user.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       500:
 *         $ref: '#/components/responses/ServerErrorResponse'
 */
exports.updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Explicitly exclude user_id and array fields from direct update via this endpoint
        const { user_id, borrowed_book_ids, reserved_book_ids, wishlist_book_ids, ...updateData } = req.body;

        // Prevent updating with an empty object
        if (Object.keys(updateData).length === 0) {
             return res.status(400).json({ success: false, error: { message: 'No update data provided.' } });
        }

        // If library_id is being updated, check if the target library exists
        if (updateData.library_id) {
            const libraryExists = await prisma.library.findUnique({
                 where: { library_id: updateData.library_id },
                 select: { library_id: true}
             });
             if (!libraryExists) {
                 return res.status(400).json({ success: false, error: { message: `Cannot update: Target library with ID ${updateData.library_id} not found.` } });
             }
        }

        // Attempt the update
        const updatedUser = await prisma.user.update({
            where: { user_id: id },
            data: updateData,
        });
        handleSuccess(res, updatedUser);

    } catch (error) {
         // Handle potential unique constraint violation on email update
         if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
             return res.status(409).json({ success: false, error: { message: 'Email address already exists for another user.' } });
         }
         // P2025 (Record to update not found) will be caught by global handler
         // P2003 (Foreign key constraint) on library_id handled by the check above
        next(error);
    }
};

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Delete a user by ID
 *     tags: [Users]
 *     description: Permanently deletes a user record. Consider implementing soft delete (setting `is_active` to false) instead for data retention. Associated records (borrows, reviews etc.) might be deleted due to CASCADE rules in the schema.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The unique identifier of the user to delete.
 *     responses:
 *       204:
 *         description: User deleted successfully (No Content).
 *       404:
 *         $ref: '#/components/responses/NotFoundResponse'
 *       500:
 *         $ref: '#/components/responses/ServerErrorResponse'
 */
exports.deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        // The delete operation will automatically cascade based on schema `ON DELETE CASCADE` rules.
        // Be aware of the consequences - deleting a user will delete their borrows, reviews, wishlists etc.
        await prisma.user.delete({
            where: { user_id: id }
        });
        // Send No Content for successful deletion
        res.status(204).send();
    } catch (error) {
        // P2025 (Record to delete not found) handled by global handler
        next(error);
    }
};