const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Analytics
 *     description: Library analytics and statistics for admin users
 */

router.get('/',
    authenticate,
    isAdmin,
    analyticsController.getAnalytics);

module.exports = router; 