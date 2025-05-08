const nodemailer = require('nodemailer');

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
    connectionTimeout: 10000,  // 10 seconds connection timeout
    greetingTimeout: 10000,    // 10 seconds for EHLO/HELO handshake
    socketTimeout: 15000,      // 15 seconds socket timeout
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});
transporter.verify((error, success) => {
    if (error) {
        console.error('Email configuration error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

module.exports = {
    transporter
}
