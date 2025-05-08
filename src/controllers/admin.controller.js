const jwt = require('jsonwebtoken');
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();
const { transporter } = require('../utils/mailHandler');


// Helper for success responses (optional)
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

/**
 * @swagger
 * /api/v1/admin:
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
 *             $ref: '#/components/schemas/Admin'
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
        const { library_name, name, email, jwt: token, library_address, library_city, library_state, library_country, phone_number } = req.body;

        // --- Basic Input Validation ---
        if (!library_name || !name || !email || !token || !library_address || !library_city || !library_state || !library_country || !phone_number) {
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
        const newPolicy = await prisma.policy.create({
            data: {
                library_id: newLibrary.library_id,
                max_borrow_days: 14,
                fine_per_day: 1,
                max_books_per_user: 4,
                reservation_expiry_days: 1,
            },
        });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);



        // --- Attempt to create user ---
        const newUser = await prisma.user.create({
            data: {
                user_id: decoded.sub, // Provided from input
                library_id: newLibrary.library_id, // Use the ID from the created library
                name,
                email,
                role: "admin",
                is_active: true, // Default to true if not provided
                // Array fields usually managed by other endpoints
                age: req.body.age ?? null, // Default to null if not provided
                phone_number: phone_number, // Default to null if not provided
                interests: req.body.interests ?? [], // Default to empty array if not provided
                gender: req.body.gender
            },
        });

        // Send confirmation email to the new admin
        const mailOptions = {
            from: `"ShelfSpace" <${process.env.CUSTOM_EMAIL_ICLOUD}>`,
            to: email,
            subject: 'Your Library Administrator Account Created',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                    <h2 style="color: #333;">Welcome to ${library_name}!</h2>
                    <p>Hello ${name},</p>
                    <p>Your library administrator account has been successfully created. Here are your account details:</p>
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Phone Number:</strong> ${phone_number || 'Not provided'}</p>
                        <p><strong>Role:</strong> Administrator</p>
                    </div>
                    <h3>Library Details:</h3>
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <p><strong>Library Name:</strong> ${library_name}</p>
                        <p><strong>Address:</strong> ${library_address}</p>
                        <p><strong>City:</strong> ${library_city}</p>
                        <p><strong>State:</strong> ${library_state}</p>
                        <p><strong>Country:</strong> ${library_country}</p>
                    </div>
                    <h3>Default Library Policies:</h3>
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <p><strong>Maximum Borrowing Period:</strong> ${newPolicy.max_borrow_days} days</p>
                        <p><strong>Fine Per Day (Late Return):</strong> $${newPolicy.fine_per_day}</p>
                        <p><strong>Maximum Books Per User:</strong> ${newPolicy.max_books_per_user}</p>
                        <p><strong>Reservation Expiry:</strong> ${newPolicy.reservation_expiry_days} day(s)</p>
                    </div>
                    <p>You now have full administrative access to manage your library's digital system. You can modify these policies at any time through the admin dashboard.</p>
                    <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                    <p>Best regards,<br>ShelfSpace Team</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('Admin confirmation email sent successfully');
        } catch (emailError) {
            console.error('Error sending admin confirmation email:', emailError);
            // Log detailed error but continue with the response
        }

        handleSuccess(res, { user: newUser, library: newLibrary }, 201);

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
