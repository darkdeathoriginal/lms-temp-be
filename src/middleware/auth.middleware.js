// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const handleAuthError = (res, message, statusCode = 401) => {
    return res.status(statusCode).json({ success: false, error: { message } });
};

/**
 * Middleware to authenticate requests using JWT.
 * Verifies the token and attaches user information to req.user.
 */
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return handleAuthError(res, 'Unauthorized: No token provided or invalid format.');
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verify the token using the secret key
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(decoded);
        

        // --- Optional but Recommended: Check if user still exists and is active ---
        const user = await prisma.user.findUnique({
            where: { user_id: decoded.sub },
            select: { user_id: true, role: true, is_active: true } // Select only needed fields
        });

        if (!user) {
            return handleAuthError(res, 'Unauthorized: User not found.');
        }

        if (!user.is_active) {
            return handleAuthError(res, 'Unauthorized: User account is inactive.', 403); // Or 401
        }
        // --- End Optional Check ---

        // Attach user info to the request object
        // Ensure the payload structure matches what your login function creates
        req.user = {
            id: user.user_id, // Use the validated ID from DB
            role: user.role,   // Use the validated role from DB
            // Add other relevant non-sensitive info if needed
        };

        next(); // Proceed to the next middleware or route handler

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return handleAuthError(res, 'Unauthorized: Token has expired.');
        }
        if (error instanceof jwt.JsonWebTokenError) {
            return handleAuthError(res, 'Unauthorized: Invalid token.');
        }
        // Handle other potential errors during verification or DB lookup
        console.error("Authentication error:", error);
        return handleAuthError(res, 'Internal server error during authentication.', 500);
    }
};

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return handleAuthError(res, 'Unauthorized: No token provided or invalid format.');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return handleAuthError(res, 'Unauthorized: Invalid token.');
        }
        req.user = decoded; // Attach the decoded token to the request object
        next();
    });
}

/**
 * Middleware factory to authorize requests based on allowed roles.
 * Use this *after* the `authenticate` middleware.
 * @param {string[]} allowedRoles - Array of roles allowed to access the route (e.g., ['Admin', 'Librarian'])
 */
const authorize = (allowedRoles = []) => {
    // Ensure allowedRoles is always an array
    if (typeof allowedRoles === 'string') {
        allowedRoles = [allowedRoles];
    }

    return (req, res, next) => {
        // This middleware assumes `authenticate` has run successfully and attached req.user
        if (!req.user || !req.user.role) {
            // Should technically be caught by `authenticate`, but double-check
            return handleAuthError(res, 'Forbidden: Authentication required.', 403);
        }

        if (!allowedRoles.includes(req.user.role)) {
            return handleAuthError(res, `Forbidden: Access denied. Required role(s): ${allowedRoles.join(', ')}`, 403);
        }

        next(); // User has the required role, proceed
    };
};

// --- Convenience Role-Specific Middleware ---
const isAdmin = authorize(['admin']);
const isLibrarian = authorize(['librarian']);
const isMember = authorize(['member']);
const isAdminOrLibrarian = authorize(['admin', 'librarian']);

module.exports = {
    authenticate,
    authorize,
    isAdmin,
    isLibrarian,
    isMember,
    isAdminOrLibrarian,
    verifyToken
};