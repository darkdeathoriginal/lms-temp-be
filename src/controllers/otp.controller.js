const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');

// Log email configuration (without password)
console.log('Email Configuration:', {
    user: process.env.EMAIL_USER,
    host: 'smtp.mail.me.com',
    port: 587
});

// Create a transporter for sending emails
const transporter = nodemailer.createTransport({
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
        user: process.env.EMAIL_USER, // Should be your full iCloud email address
        pass: process.env.EMAIL_PASSWORD // Should be an app-specific password
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});

// Verify transporter configuration
transporter.verify(function (error, success) {
    if (error) {
        console.log('Email configuration error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

// In-memory storage for OTPs
const otpStore = new Map();

/**
 * Generate a 6-digit numeric OTP
 */
const generateNumericOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Check if user has exceeded rate limit
 */
const checkRateLimit = (email) => {
    const now = Date.now();
    const userLimit = otpStore.get(`limit_${email}`) || { count: 0, timestamp: now };

    // Reset count if more than 1 hour has passed
    if (now - userLimit.timestamp > 3600000) {
        userLimit.count = 0;
        userLimit.timestamp = now;
    }

    // Check if user has exceeded 5 attempts per hour
    if (userLimit.count >= 5) {
        return false;
    }

    userLimit.count++;
    otpStore.set(`limit_${email}`, userLimit);
    return true;
};

/**
 * @swagger
 * /api/v1/otp/generate:
 *   post:
 *     summary: Generate and send OTP to user's email
 *     tags: [OTP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully
 *       400:
 *         description: Bad request
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Server error
 */
const generateOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: { message: 'Email is required' }
            });
        }

        // Check rate limit
        if (!checkRateLimit(email)) {
            return res.status(429).json({
                success: false,
                error: { message: 'Too many OTP requests. Please try again later.' }
            });
        }

        // Generate a 6-digit numeric OTP
        const otp = generateNumericOTP();

        // Set OTP expiry to 5 minutes from now
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 5);

        // Store OTP in memory
        otpStore.set(email, {
            otp,
            expiresAt,
            isUsed: false
        });

        // Send OTP via email
        const mailOptions = {
            from: `"ShelfSpace" <${process.env.CUSTOM_EMAIL_ICLOUD}>`,
            to: email,
            subject: 'Your OTP for 2FA Verification',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">OTP Verification</h2>
                    <p>Your OTP for verification is:</p>
                    <div style="background-color: #f4f4f4; padding: 10px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0;">
                        ${otp}
                    </div>
                    <p>This OTP will expire in 5 minutes.</p>
                    <p style="color: #666; font-size: 12px;">If you didn't request this OTP, please ignore this email.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully'
        });
    } catch (error) {
        console.error('Error generating OTP:', error);
        res.status(500).json({
            success: false,
            error: {
                message: 'Failed to generate OTP',
                details: error.message
            }
        });
    }
};

/**
 * @swagger
 * /api/v1/otp/verify:
 *   post:
 *     summary: Verify OTP
 *     tags: [OTP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               otp:
 *                 type: string
 *                 description: 6-digit OTP code
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP verified successfully
 *       400:
 *         description: Bad request or invalid OTP
 *       500:
 *         description: Server error
 */
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                error: { message: 'Email and OTP are required' }
            });
        }

        // Validate OTP format
        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                error: { message: 'OTP must be a 6-digit number' }
            });
        }

        // Get stored OTP
        const storedOTP = otpStore.get(email);

        if (!storedOTP) {
            return res.status(400).json({
                success: false,
                error: { message: 'No OTP found for this email' }
            });
        }

        if (storedOTP.isUsed) {
            return res.status(400).json({
                success: false,
                error: { message: 'OTP has already been used' }
            });
        }

        if (new Date() > storedOTP.expiresAt) {
            return res.status(400).json({
                success: false,
                error: { message: 'OTP has expired' }
            });
        }

        if (storedOTP.otp !== otp) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid OTP' }
            });
        }

        // Mark OTP as used
        storedOTP.isUsed = true;
        otpStore.set(email, storedOTP);

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully'
        });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to verify OTP' }
        });
    }
};

module.exports = {
    generateOTP,
    verifyOTP
}; 