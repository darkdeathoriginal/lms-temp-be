const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');


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
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
exports.createUser = async (req, res, next) => {
    try {
        const {  library_name, name, email,jwt, library_address,library_city,library_state,library_country,phone_number} = req.body;

        // --- Basic Input Validation ---
        if ( !library_name || !name || !email || !role || !jwt || !library_address || !library_city || !library_state || !library_country || !phone_number)  {
            // Using return here to stop execution before hitting prisma query
            return res.status(400).json({ success: false, error: { message: 'Missing required fields:  library_name, name, email' } });
        }
        // Add more specific validation if needed (e.g., email format, role enum check - though Prisma handles enum)

        // --- Check if referenced library exists ---
        // It's better to check before attempting the create to give a clearer error.
        // Prisma's P2003 on library_id would also work but the error message is less specific.
        const newLibrary = await prisma.library.create({
            data: {
                "name": library_name,
                "address": library_address,
                "city": library_city,
                "state": library_state,
                "country": library_country,
              },
          });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

          

        // --- Attempt to create user ---
        const newUser = await prisma.user.create({
            data: {
                user_id:decoded.sub, // Provided from input
                library_id: newLibrary.library_id, // Use the ID from the created library
                name,
                email,
                role:"admin",
                is_active: req.body.is_active ?? true, // Default to true if not provided
                // Array fields usually managed by other endpoints
                age: req.body.age ?? null, // Default to null if not provided
                phone_number: phone_number, // Default to null if not provided
                interests: req.body.interests ?? [], // Default to empty array if not provided
                gender: req.body.gender 
            },
        });
        handleSuccess(res, {user:newUser,library:newLibrary}, 201);

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
