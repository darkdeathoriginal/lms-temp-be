// src/controllers/policy.controller.js
const { Prisma } = require('@prisma/client');
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

// Helper for success responses
const handleSuccess = (res, data, statusCode = 200) => res.status(statusCode).json(data);

// --- Validation Helper ---
const validatePolicyInput = (data) => {
    const errors = [];
    const requiredInts = ['max_borrow_days', 'max_books_per_user', 'reservation_expiry_days'];
    const requiredNumeric = ['fine_per_day'];

    for (const field of requiredInts) {
        if (data[field] === undefined || data[field] === null) continue; // Allow partial updates
        const value = parseInt(data[field], 10);
        if (isNaN(value) || value <= 0) {
            errors.push(`${field} must be a positive integer.`);
        }
         data[field] = value; // Ensure it's stored as int
    }

    for (const field of requiredNumeric) {
         if (data[field] === undefined || data[field] === null) continue; // Allow partial updates
         // Prisma expects Decimal compatible type (Number or String representation)
         // Let's try parsing to ensure it's numeric and non-negative
         const value = parseFloat(data[field]);
         if (isNaN(value) || value < 0) {
             errors.push(`${field} must be a non-negative number.`);
         }
         // Keep as number/string for Prisma Decimal mapping
         data[field] = value; // Or keep as string if needed: data[field] = String(value);
    }

    if (errors.length > 0) {
        // Throw a single error with all validation messages
        throw new Error(`Validation failed: ${errors.join(' ')}`);
    }
    return data; // Return potentially type-coerced data
};


/**
 * @swagger
 * components:
 *   schemas:
 *     Policy:
 *       # Already defined in swagger.js
 *     PolicyInput:
 *       # Already defined in swagger.js
 *     PaginationInfo:
 *      # Already defined in swagger.js
 *   parameters:
 *      PolicyIdPathParam:
 *        name: policyId
 *        in: path
 *        required: true
 *        schema: { type: string, format: uuid }
 *        description: The unique identifier of the policy.
 *      LibraryIdPathParam:
 *         name: libraryId
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: The unique identifier of the library.
 */

/**
 * @controller PolicyController
 */

/**
 * @method createPolicy
 * @description Creates a new policy for a specific library. A library can only have one policy. Requires Admin role.
 * @route POST /api/v1/policies
 * @access Admin
 * @tag Policies
 */
exports.createPolicy = async (req, res, next) => {
    try {
        const { library_id, ...policyData } = req.body;

        // 1. Basic Input Validation
        if (!library_id) {
            return res.status(400).json({ success: false, error: { message: 'library_id is required.' } });
        }
        const requiredFields = ['max_borrow_days', 'fine_per_day', 'max_books_per_user', 'reservation_expiry_days'];
        const missingFields = requiredFields.filter(field => policyData[field] === undefined || policyData[field] === null);
        if (missingFields.length > 0) {
             return res.status(400).json({ success: false, error: { message: `Missing required fields: ${missingFields.join(', ')}` } });
        }

        // 2. Specific Value Validation
        const validatedData = validatePolicyInput(policyData); // Throws error on failure

        // 3. Check if Library exists and Policy doesn't already exist for it (use transaction)
        const newPolicy = await prisma.$transaction(async (tx) => {
            const library = await tx.library.findUnique({
                where: { library_id },
                select: { library_id: true }
            });
            if (!library) {
                throw new Error(`Library with ID ${library_id} not found.`); // Custom error for clarity
            }

            // Attempt to create. Prisma's unique constraint on library_id will handle duplicates.
            return tx.policy.create({
                data: {
                    library_id,
                    ...validatedData // Use validated (and potentially type-coerced) data
                }
            });
        });

        handleSuccess(res, newPolicy, 201);

    } catch (error) {
         // Handle specific errors
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && error.meta?.target?.includes('library_id')) {
             return res.status(409).json({ success: false, error: { message: `A policy already exists for library ID ${req.body.library_id}. Use PUT to update.` } });
         }
         if (error instanceof Error && (error.message.includes('not found') || error.message.includes('Validation failed'))) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // Pass other errors to global handler
        next(error);
    }
};

/**
 * @method getAllPolicies
 * @description Retrieves a paginated list of all policies across all libraries. Requires Admin or Librarian role.
 * @route GET /api/v1/policies
 * @access Admin, Librarian
 * @tag Policies
 */
exports.getAllPolicies = async (req, res, next) => {
    try {
        // --- Pagination & Sorting ---
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;

        // Sort by library reference maybe? Or creation date?
        const allowedSortBy = ['created_at', 'updated_at', 'library_id']; // Add more fields if needed
        const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'created_at';
        const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

        // No specific filters usually needed for policies, but could add if required

        // --- Database Query ---
        const [policies, totalPolicies] = await prisma.$transaction([
            prisma.policy.findMany({
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: { // Include library name for context
                    library: { select: { name: true } }
                }
            }),
            prisma.policy.count() // Total count without filters
        ]);

        // --- Response ---
        handleSuccess(res, {
            data: policies,
            pagination: {
                totalItems: totalPolicies,
                currentPage: page,
                itemsPerPage: limit,
                totalPages: Math.ceil(totalPolicies / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @method getPolicyByLibraryId
 * @description Fetches the policy for a specific library using the library's ID. Available to any authenticated user.
 * @route GET /api/v1/policies/library/{libraryId}
 * @access Authenticated Users
 * @tag Policies
 */
exports.getPolicyByLibraryId = async (req, res, next) => {
    try {
        const { libraryId } = req.params;
        // Use findUniqueOrThrow on the unique library_id field
        const policy = await prisma.policy.findUniqueOrThrow({
             where: { library_id: libraryId },
             include: { // Include library name for context
                 library: { select: { name: true } }
             }
        });
        handleSuccess(res, policy);
    } catch (error) {
        // P2025 (NotFound) handled by global handler. Handles cases where library exists but has no policy.
        next(error);
    }
};


/**
 * @method updatePolicy
 * @description Updates an existing policy using its unique policy ID. Requires Admin role.
 * @route PUT /api/v1/policies/{policyId}
 * @access Admin
 * @tag Policies
 */
exports.updatePolicy = async (req, res, next) => {
    try {
        const { policyId } = req.params;
        const { library_id, ...policyData } = req.body; // library_id cannot be changed

        if (Object.keys(policyData).length === 0) {
             return res.status(400).json({ success: false, error: { message: 'No update data provided.' } });
        }

        // Validate the provided values
        const validatedData = validatePolicyInput(policyData); // Throws error on failure

        const updatedPolicy = await prisma.policy.update({
            where: { policy_id: policyId },
            data: validatedData, // Use validated data
        });
        handleSuccess(res, updatedPolicy);
    } catch (error) {
         // Catch validation errors
         if (error instanceof Error && error.message.includes('Validation failed')) {
            return res.status(400).json({ success: false, error: { message: error.message } });
         }
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};

/**
 * @method deletePolicy
 * @description Deletes a policy using its unique policy ID. Requires Admin role.
 * @route DELETE /api/v1/policies/{policyId}
 * @access Admin
 * @tag Policies
 */
exports.deletePolicy = async (req, res, next) => {
    try {
        const { policyId } = req.params;
        await prisma.policy.delete({
            where: { policy_id: policyId }
        });
        res.status(204).send(); // No content on successful delete
    } catch (error) {
        // P2025 (NotFound) handled by global handler
        next(error);
    }
};