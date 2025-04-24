// src/routes/policy.routes.js
const express = require('express');
const policyController = require('../controllers/policy.controller');
const { authenticate, isAdmin, isLibrarian, isAdminOrLibrarian } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * Base Path: /api/v1/policies
 */

/**
 * @swagger
 * /api/v1/policies:
 *   post:
 *     summary: Create a new library policy (Admin Only)
 *     tags: [Policies]
 *     description: Creates a policy for a library. Each library can only have one policy.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/PolicyInput' } } }
 *     responses:
 *       201: { description: 'Policy created successfully', content: { application/json: { schema: { $ref: '#/components/schemas/Policy' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       409: { description: 'Conflict - Policy already exists for this library', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.post('/',
    authenticate,
    isAdmin,
    policyController.createPolicy
);

/**
 * @swagger
 * /api/v1/policies:
 *   get:
 *     summary: Retrieve a list of all policies (Admin/Librarian Only)
 *     tags: [Policies]
 *     description: Gets a paginated list of all policies across all libraries.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PageQueryParam' }
 *       - { $ref: '#/components/parameters/LimitQueryParam' }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, default: 'created_at', enum: [created_at, updated_at, library_id] }
 *         description: Field to sort by.
 *       - { $ref: '#/components/parameters/SortOrderQueryParam' }
 *     responses:
 *       200: { description: 'A paginated list of policies', content: { application/json: { schema: { type: object, properties: { data: { type: array, items: { $ref: '#/components/schemas/Policy' } }, pagination: { $ref: '#/components/schemas/PaginationInfo' } } } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/',
    authenticate,
    isAdminOrLibrarian, // Allow librarians to view all policies too
    policyController.getAllPolicies
);

/**
 * @swagger
 * /api/v1/policies/library/{libraryId}:
 *   get:
 *     summary: Retrieve the policy for a specific library (Authenticated Users)
 *     tags: [Policies]
 *     description: Gets the policy associated with a given library ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/LibraryIdPathParam' }
 *     responses:
 *       200: { description: 'Policy details for the library', content: { application/json: { schema: { $ref: '#/components/schemas/Policy' } } } }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       404: { description: 'Not Found - No policy found for the specified library ID.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.get('/library/:libraryId',
    authenticate, // Allow any authenticated user to see the policy for a library
    policyController.getPolicyByLibraryId
);


/**
 * @swagger
 * /api/v1/policies/{policyId}:
 *   put:
 *     summary: Update a policy by its ID (Admin Only)
 *     tags: [Policies]
 *     description: Updates an existing policy using the policy's unique ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PolicyIdPathParam' }
 *     requestBody:
 *       required: true
 *       description: Provide only the fields you want to update. `library_id` cannot be changed.
 *       content: { application/json: { schema: { $ref: '#/components/schemas/PolicyInput' } } } # Use input schema, but note only partial fields are needed
 *     responses:
 *       200: { description: 'Policy updated successfully', content: { application/json: { schema: { $ref: '#/components/schemas/Policy' } } } }
 *       400: { $ref: '#/components/responses/BadRequestResponse' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.put('/:policyId',
    authenticate,
    isAdmin,
    policyController.updatePolicy
);

/**
 * @swagger
 * /api/v1/policies/{policyId}:
 *   delete:
 *     summary: Delete a policy by its ID (Admin Only)
 *     tags: [Policies]
 *     description: Deletes a specific policy using its unique ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { $ref: '#/components/parameters/PolicyIdPathParam' }
 *     responses:
 *       204: { description: 'Policy deleted successfully (No Content)' }
 *       401: { $ref: '#/components/schemas/UnauthorizedResponse' }
 *       403: { $ref: '#/components/schemas/ForbiddenResponse' }
 *       404: { $ref: '#/components/responses/NotFoundResponse' }
 *       500: { $ref: '#/components/responses/ServerErrorResponse' }
 */
router.delete('/:policyId',
    authenticate,
    isAdmin,
    policyController.deletePolicy
);

module.exports = router;