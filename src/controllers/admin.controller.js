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
<div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #fafafa; border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 151, 168, 0.15);">
  
  <h2 style="color: #0097a8; border-bottom: 2px solid #80d3fa; padding-bottom: 10px; margin-bottom: 25px;">Welcome to ${library_name}!</h2>

  <p style="color: #212121; font-size: 16px;">Hello <strong>${name}</strong>,</p>

  <p style="color: #212121; font-size: 16px;">Your library administrator account has been successfully created. Here are your details:</p>

  <div style="background-color: #e6f8fb; padding: 20px; border-left: 5px solid #0097a8; border-radius: 8px; margin: 20px 0;">
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone Number:</strong> ${phone_number || 'Not provided'}</p>
    <p><strong>Role:</strong> Administrator</p>
  </div>

  <h3 style="color: #2c7be2; margin-top: 30px;">Library Details</h3>
  <div style="background-color: #e8f1fd; padding: 20px; border-left: 5px solid #2c7be2; border-radius: 8px; margin: 15px 0;">
    <p><strong>Library Name:</strong> ${library_name}</p>
    <p><strong>Address:</strong> ${library_address}</p>
    <p><strong>City:</strong> ${library_city}</p>
    <p><strong>State:</strong> ${library_state}</p>
    <p><strong>Country:</strong> ${library_country}</p>
  </div>

  <h3 style="color: #0097a8; margin-top: 30px;">Default Library Policies</h3>
  <div style="background-color: #dff7fb; padding: 20px; border-left: 5px solid #0097a8; border-radius: 8px; margin: 15px 0;">
    <p><strong>Maximum Borrowing Period:</strong> ${newPolicy.max_borrow_days} days</p>
    <p><strong>Fine Per Day (Late Return):</strong> ${newPolicy.fine_per_day}</p>
    <p><strong>Maximum Books Per User:</strong> ${newPolicy.max_books_per_user}</p>
    <p><strong>Reservation Expiry:</strong> ${newPolicy.reservation_expiry_days} day(s)</p>
  </div>

  <p style="color: #212121; font-size: 16px;">You now have full administrative access to manage your library's digital system. You can update these policies anytime via the admin dashboard.</p>

  <p style="color: #212121; font-size: 16px;">If you need help, feel free to contact our support team at any time.</p>

  <p style="margin-top: 30px; color: #2c7be2;"><strong>– The ShelfSpace Team</strong></p>
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
