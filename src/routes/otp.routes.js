const express = require('express');
const otpController = require('../controllers/otp.controller');

const router = express.Router();

// POST /api/v1/otp/generate - Generate and send OTP (No auth required)
router.post('/generate', otpController.generateOTP);

// POST /api/v1/otp/verify - Verify OTP (No auth required)
router.post('/verify', otpController.verifyOTP);

module.exports = router; 