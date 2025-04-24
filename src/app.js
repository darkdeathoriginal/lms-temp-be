// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');

// --- Load Environment Variables ---
// Ensure dotenv config is run before other modules that might need process.env
dotenv.config();

const swaggerSpec = require('./config/swagger'); // Swagger configuration
const mainRouter = require('./routes/index');     // Combined routes (MUST EXIST)
const errorHandler = require('./utils/errorHandler'); // Global error handler
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient(); // Instantiate prisma client

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(helmet()); // Set various HTTP headers for security
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev')); // HTTP request logger (use 'combined' for production)
}

// --- API Documentation Route ---
// Serve Swagger UI at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true, // Enable search bar
}));

// --- API Routes ---
// Mount all routes defined in src/routes/index.js
// All routes from index.js will be prefixed automatically (e.g., /api/v1/libraries)
app.use('/', mainRouter);

// --- Default Route for Root Path ---
// Optional: Redirect root to API docs or provide a welcome message
app.get('/', (req, res) => {
    // Option 1: Redirect to docs
    // res.redirect('/api-docs');

    // Option 2: Simple welcome message
     res.json({
        message: 'Welcome to the Library Management API!',
        documentation: '/api-docs'
    });
});


// --- 404 Handler (Not Found) ---
// Place this after all routes definitions
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: { message: `Not Found - Cannot ${req.method} ${req.originalUrl}` }
     });
});


// --- Global Error Handler ---
// Must be the LAST middleware defined
app.use(errorHandler);

// --- Prisma disconnect on shutdown ---
// Function to gracefully shut down the server and Prisma client
const shutdown = async (signal) => {
    console.log(`\n${signal} signal received. Closing HTTP server...`);
    // Close server first
    app.close(async () => {
        console.log('HTTP server closed.');
        // Then disconnect Prisma
        try {
            await prisma.$disconnect();
            console.log('Prisma Client disconnected.');
            process.exit(0);
        } catch (e) {
            console.error('Error disconnecting Prisma Client:', e);
            process.exit(1);
        }
    });
};


// Export the app and the shutdown function
module.exports = { app, shutdown, prisma }; // Export prisma if needed elsewhere (e.g., complex services)