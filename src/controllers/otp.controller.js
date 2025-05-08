const { transporter } = require("../utils/mailHandler");
const { getPrismaClient } = require('../../prisma/client');
const prisma = getPrismaClient();

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/**
 * Generate a 6-digit numeric OTP
 */
const generateNumericOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP email asynchronously without waiting for response
 */
const sendOTPEmail = async (email, otp) => {
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

    // Fire and forget - don't await or catch errors here
    transporter.sendMail(mailOptions)
        .then(() => console.log('OTP email sent successfully to:', email))
        .catch(error => console.error('Error sending OTP email:', error));
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
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
    }

    try {
        const otp = generateNumericOTP();
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        // Simplified transaction - only check rate limit and create new OTP
        const recentCount = await prisma.oTPVerification.count({
            where: {
                email,
                createdat: { gte: new Date(Date.now() - 60 * 60 * 1000) },
                isused: false,
                expiresat: { gt: new Date() }
            }
        });

        if (recentCount >= MAX_ATTEMPTS) {
            return res.status(429).json({
                success: false,
                error: 'Too many OTP requests'
            });
        }

        // Create new OTP without waiting for completion
        prisma.oTPVerification.create({
            data: { email, otp, expiresat: expiresAt }
        }).catch(console.error);

        // Send email without waiting
        sendOTPEmail(email, otp);

        // Immediate response
        res.status(200).json({
            success: true,
            message: 'OTP sent successfully'
        });

    } catch (error) {
        console.error('OTP generation error:', error);
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
    const { email, otp } = req.body;

    if (!email || !otp || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({ success: false });
    }

    try {
        const otpRecord = await prisma.oTPVerification.findFirst({
            where: {
                email,
                isused: false,
                expiresat: { gt: new Date() },
                attempts: { lt: MAX_ATTEMPTS }
            },
            orderBy: { createdat: 'desc' }
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                error: { message: 'No valid OTP found for this email' }
            });
        }

        if (otpRecord.otp !== otp) {
            await prisma.oTPVerification.update({
                where: { id: otpRecord.id },
                data: { attempts: { increment: 1 } }
            });
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid OTP' }
            });
        }

        // Mark as used without waiting
        prisma.oTPVerification.update({
            where: { id: otpRecord.id },
            data: { isused: true }
        }).catch(console.error);

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully'
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Failed to verify OTP' }
        });
    }
};

module.exports = { generateOTP, verifyOTP };

module.exports = {
    generateOTP,
    verifyOTP
};