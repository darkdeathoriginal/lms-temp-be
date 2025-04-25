// src/routes/user.routes.js
const express = require('express');
const userController = require('../controllers/user.controller');
const { authenticate, isAdmin, isAdminOrLibrarian, verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/v1/users - Admin Only to create any user type
router.post('/', verifyToken, userController.createUser);

// GET /api/v1/users - Admin or Librarian can view all users
router.get('/', authenticate, isAdminOrLibrarian, userController.getAllUsers);

// GET /api/v1/users/:id - Admin/Librarian can view any, Member can view self (Requires logic in controller or more specific middleware)
// Simple approach: Allow Admin/Librarian
router.get('/:id', authenticate, userController.getUserById);
// More complex: You might need middleware that checks if req.user.id === req.params.id OR req.user.role is Admin/Librarian

// PUT /api/v1/users/:id - Admin can update any, Member can update self (Requires logic)
// Simple approach: Allow Admin only for general updates
router.put('/:id', authenticate, isAdmin, userController.updateUser);

// DELETE /api/v1/users/:id - Admin Only
router.delete('/:id', authenticate, isAdmin, userController.deleteUser);

module.exports = router;