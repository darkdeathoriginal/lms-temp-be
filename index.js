// server.js - Main entry point for the application
const { app, shutdown } = require('./src/app'); // Import app and shutdown handler

const PORT = process.env.PORT || 3000;

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`API documentation available at http://localhost:${PORT}/api-docs`);
  console.log(`Root access: http://localhost:${PORT}/`);
});

// --- Graceful Shutdown Handling ---
// Listen for termination signals (e.g., from Docker, Kubernetes, Ctrl+C)
// process.on('SIGTERM', () => shutdown('SIGTERM'));
// process.on('SIGINT', () => shutdown('SIGINT')); // Catches Ctrl+C

// // Optional: Handle unhandled promise rejections and uncaught exceptions
// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection at:', promise, 'reason:', reason);
//   // Consider shutting down gracefully here as well, depending on the error severity
//   // shutdown('Unhandled Rejection');
// });

// process.on('uncaughtException', (error) => {
//   console.error('Uncaught Exception:', error);
//   // It's generally recommended to shut down after an uncaught exception
//   // as the application might be in an inconsistent state.
//   shutdown('Uncaught Exception');
// });

module.exports = server; // Optional: Export server for testing frameworks