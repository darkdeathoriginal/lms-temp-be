// api/index.js - Vercel Entry Point

// Import the configured Express app instance from your main app file
const { app } = require('../src/app.js'); // Adjust the path based on your structure

// Export the app instance as the default handler for Vercel
export default app;

// --- DO NOT ADD app.listen() HERE ---