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
    // Optimize timeouts for better performance
    connectionTimeout: 5000,     // 5 seconds connection timeout (faster fail)
    greetingTimeout: 5000,       // 5 seconds for EHLO/HELO handshake
    socketTimeout: 10000,        // 10 seconds socket timeout
    pool: true,                  // Use connection pooling for better performance
    maxConnections: 5,           // Maximum number of simultaneous connections
    maxMessages: Infinity,       // Maximum number of messages per connection
    rateDelta: 1000,             // Define the time window for rate limiting
    rateLimit: 5,                // Maximum number of messages per rateDelta
    tls: {
        rejectUnauthorized: false // Less strict TLS for better compatibility
    },
    debug: process.env.NODE_ENV === 'development' // Enable debug only in development
});

// Keep pre-authenticated connections in the pool
transporter.on('idle', function () {
    // This event is emitted when the connection pool has free connections
    console.log('SMTP connection pool is idle, ready to send messages');
});

// Handle connection errors
transporter.on('error', (err) => {
    console.error('SMTP connection error:', err);
});

// Verify connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('Email configuration error:', error);
    } else {
        console.log('Email server connection established and ready to send messages');
    }
});

// Helper function for sending emails with retries
const sendMailWithRetry = async (mailOptions, retries = 2) => {
    try {
        return await transporter.sendMail(mailOptions);
    } catch (error) {
        if (retries > 0 && error.code !== 'EAUTH') { // Don't retry auth errors
            console.log(`Retrying email sending (${retries} attempts left)`);
            return sendMailWithRetry(mailOptions, retries - 1);
        }
        throw error;
    }
};

module.exports = {
    transporter,
    sendMailWithRetry
};
