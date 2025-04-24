// src/utils/errorHandler.js
const { Prisma } = require('@prisma/client');

const errorHandler = (err, req, res, next) => {
  console.error(err); // Log error for debugging

  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma specific errors
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409; // Conflict
        message = `Unique constraint failed on the field(s): ${err.meta?.target?.join(', ')}`;
        break;
      case 'P2025': // Record not found
        statusCode = 404;
        message = 'Resource not found.';
        // Provide more context if possible from err.meta.cause
        if (err.meta?.cause) {
             message = err.meta.cause;
        } else if (err.message.includes('prisma.findUniqueOrThrow')) {
             message = 'Required resource not found.'
        }
        break;
      // Add more specific Prisma error codes as needed
      default:
        statusCode = 400; // Bad Request for other known client errors
        message = 'Database request error. Check input data.';
        break;
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400; // Bad Request
    message = 'Validation error: Invalid input data provided.';
    // You might want to parse err.message for more specific details
  } else if (err.name === 'ValidationError') { // Example for a generic validation error
      statusCode = 400;
      message = err.message;
  }
  // Add handling for other error types if needed

  res.status(statusCode).json({
    success: false,
    error: {
        message: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }), // Include stack trace in dev
        ...(err.code && { code: err.code }), // Include error code if available
        ...(err.meta && { meta: err.meta }), // Include meta if available (sensitive data might be here!)
    }
   });
};

module.exports = errorHandler;