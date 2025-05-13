// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan"); // Import morgan
const dotenv = require("dotenv");
const swaggerUi = require("swagger-ui-express");
const http = require('http'); // <-- Import http
const WebSocket = require('ws');
const url = require('url'); // <-- Import url
const jwt = require('jsonwebtoken'); // <-- Import jsonwebtoken

// --- Load Environment Variables ---
// Ensure dotenv config is run before other modules that might need process.env
dotenv.config();

// --- Define Constants AFTER dotenv ---
const PORT = process.env.PORT || 3000; // <-- Define PORT
// It's safer to access process.env.JWT_SECRET directly in the function
// const JWT_SECRET = process.env.JWT_SECRET; // <-- Define AFTER dotenv if needed globally

const swaggerSpec = require("./config/swagger"); // Swagger configuration
const errorHandler = require("./utils/errorHandler"); // Global error handler
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient(); // Instantiate prisma client

// --- Middleware ---
app.use(cors()); // Enable CORS

// --- Configure Helmet ---
// Simplified Helmet usage - uncomment detailed CSP if needed later
app.use(helmet()); // Set various HTTP headers for security

// --- Logging Middleware ---
app.use(morgan('dev')); // <-- Use morgan for logging (choose format like 'dev', 'combined', etc.)

app.use(express.json()); // Parse JSON request bodies
//app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// --- API Documentation Route ---


// ========================================
// === HTTP Server and WebSocket Setup ===
// ========================================

// --- Create HTTP Server from Express App ---
const server = http.createServer(app); // <-- Create the server instance

// --- WebSocket Server Setup (Attached to HTTP Server) ---
const wss = new WebSocket.Server({ noServer: true }); // Don't start WebSocket server directly
const clients = new Map(); // Store authenticated clients (userId -> ws)

// --- JWT Verification Helper ---
function verifyToken(token) {
    const secret = process.env.JWT_SECRET; // <-- Read secret inside function
    if (!token || !secret) return null;
    try {
        const decoded = jwt.verify(token, secret);
        // Add validation: Check if payload contains necessary info (like userId)
        if (!decoded || !decoded.sub) { // <--- Example: Check for userId
             console.error('JWT Verification Error: Missing userId in payload');
             return null;
        }
        return decoded;
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        return null;
    }
}

// --- Handle HTTP Upgrade Requests for WebSockets ---
server.on('upgrade', (request, socket, head) => {
    console.log('Received upgrade request');
    const pathname = url.parse(request.url).pathname;

    // Only handle upgrades for the designated WebSocket path
    if (pathname === '/socket') { // <-- Ensure this path matches your client
        // Authentication Strategy 1: During Handshake
        let decodedToken = null;
        const queryParams = url.parse(request.url, true).query;
        const authHeader = request.headers.authorization;
        const protocolHeader = request.headers['sec-websocket-protocol']; // Less common for Bearer

        if (queryParams.token) {
            console.log('Attempting auth via query parameter...');
            decodedToken = verifyToken(queryParams.token);
        } else if (authHeader && authHeader.startsWith('Bearer ')) {
            console.log('Attempting auth via Authorization header...');
            const token = authHeader.substring(7);
            decodedToken = verifyToken(token);
        }
        // Add other methods like protocol header if needed

        if (decodedToken) {
            // IMPORTANT: Check if the user ID from token is valid/exists if necessary
            console.log(`Handshake authentication successful for user: ${decodedToken.userId}`);
            // Upgrade the connection
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.userId = decodedToken.sub; // Attach userId to the WebSocket object
                ws.isAuthenticated = true;
                wss.emit('connection', ws, request); // Manually emit 'connection' event
            });
        } else {
            console.log('Handshake authentication failed.');
            // Explicitly reject the connection
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
        }
    } else {
        // If the path is not '/socket', destroy the socket for this upgrade request
        console.log(`Path ${pathname} not handled for WebSocket upgrade.`);
        socket.destroy();
    }
});

// --- Handle New WebSocket Connections ---
wss.on('connection', (ws, request) => {
    // ws.isAuthenticated and ws.userId should be set by the 'upgrade' handler now

    if (!ws.isAuthenticated || !ws.userId) {
        // This shouldn't happen if the upgrade handler logic is correct
        console.error('Connection event for unauthenticated client! Closing.');
        ws.terminate();
        return;
    }

    console.log(`Client connected and authenticated: User ${ws.userId}`);

    // Store the client connection
    clients.set(ws.userId, ws);
    console.log(`Stored connection for user ${ws.userId}. Total clients: ${clients.size}`);

    // --- Handle Incoming Messages ---
    ws.on('message', (message) => {
        // Ensure client is still marked as authenticated (belt-and-suspenders)
        if (!ws.isAuthenticated) {
            console.log('Message received from client no longer marked authenticated. Ignoring.');
            return;
        }

        let parsedMessage;
        try {
            const messageString = message.toString();
            console.log(`Raw message from user ${ws.userId}:`, messageString);
            
            parsedMessage = JSON.parse(messageString);
            console.log(`Received message from user ${ws.userId}:`, parsedMessage);
        } catch (e) {
            console.log(`Received non-JSON message from user ${ws.userId}:`, message.toString());
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format. Expected JSON.' }));
            return;
        }

        // --- Handle specific message types ---
        switch (parsedMessage.type) {
            case 'chat':
                broadcast(JSON.stringify({ type: 'chat', from: ws.userId, content: parsedMessage.content }), ws);
                break;
            case 'ping_custom':
                ws.send(JSON.stringify({ type: 'pong_custom' }));
                break;
            default:
                console.log(`Received unhandled message type from user ${ws.userId}:`, parsedMessage.type);
                ws.send(JSON.stringify({ type: 'info', message: `Received type: ${parsedMessage.type}`}));
        }
    });

    // --- Handle Client Disconnect ---
    ws.on('close', (code, reason) => {
        const reasonString = reason.toString();
        console.log(`Client disconnected (User: ${ws.userId}, Code: ${code}, Reason: ${reasonString})`);
        // Remove client from map only if it's the currently stored connection for that user
        if (clients.get(ws.userId) === ws) {
            clients.delete(ws.userId);
            console.log(`Removed connection for user ${ws.userId}. Total clients: ${clients.size}`);
        }
    });

    // --- Handle Errors ---
    ws.on('error', (error) => {
        console.error(`WebSocket error for user ${ws.userId}:`, error);
        // Attempt to remove client on error as well
        if (clients.get(ws.userId) === ws) {
            clients.delete(ws.userId);
            console.log(`Removed connection for user ${ws.userId} due to error. Total clients: ${clients.size}`);
        }
    });

    // Optionally send a welcome message now that authentication is confirmed
    ws.send(JSON.stringify({ type: 'info', message: 'WebSocket connection established and authenticated.' }));
});

// --- Helper function to broadcast messages ---
function broadcast(message, sender) { // sender has ws.userId attached
    console.log(`Broadcasting message from ${sender.userId}: ${message}`);
    clients.forEach((clientWs, userId) => {
        // Check if client is authenticated, ready, and not the sender
        if (clientWs.isAuthenticated && (sender.userId ? sender.userId == userId : true) && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(message);
            console.log(`Sent message to user ${userId}`);
        }
    });
}


// --- Prisma disconnect on shutdown ---
const shutdown = async (signal) => {
    console.log(`\n${signal} signal received. Closing HTTP server...`);
    // Use the 'server' instance here
    server.close(async () => { // <-- Use server.close()
        console.log("HTTP server closed.");
        try {
            await prisma.$disconnect();
            console.log("Prisma Client disconnected.");
            process.exit(0);
        } catch (e) {
            console.error("Error disconnecting Prisma Client:", e);
            process.exit(1);
        }
    });
     // Force close connections if server doesn't close gracefully in time
     setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000); // 10 seconds timeout
};

// --- Listen for Shutdown Signals ---
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT")); // Catches Ctrl+C

// --- Start the HTTP Server ---
server.listen(PORT, () => { // <-- Use server.listen()
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📚 API Docs available at http://localhost:${PORT}/api-docs`);
    console.log(`🔌 WebSocket endpoint available at ws://localhost:${PORT}/socket`); // Added info
});

// Export the app, server, shutdown function, and prisma if needed elsewhere
module.exports = { app, server, shutdown, prisma,broadcast };
const mainRouter = require("./routes/index"); // Combined routes (MUST EXIST)


app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
      // Your swagger UI options...
  })
);

// --- API Routes ---
app.use("/", mainRouter);

// --- Default Route for Root Path ---
app.get("/", (req, res) => {
  res.json({
      message: "Welcome to the Library Management API!",
      documentation: "/api-docs",
  });
});

// --- 404 Handler (Not Found) ---
app.use((req, res, next) => {
  res.status(404).json({
      success: false,
      error: { message: `Not Found - Cannot ${req.method} ${req.originalUrl}` },
  });
});

// --- Global Error Handler ---
app.use(errorHandler);