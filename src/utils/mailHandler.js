const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');

// Log email configuration (without password)
console.log('Email Configuration:', {
    user: process.env.EMAIL_USER,
    host: 'smtp.mail.me.com',
    port: 587
});

// Create a transporter for sending emails
export const transporter = nodemailer.createTransport({
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
