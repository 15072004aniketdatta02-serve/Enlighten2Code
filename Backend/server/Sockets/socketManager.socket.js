import { Server } from "socket.io";
import { socketAuth } from "./socketAuthentication.socket.js";
import { registerEventHandlers } from "./socketEventHandlers.socket.js";
import logger from "../loggers/logger.js";

let io;

/**
 * Initialize Socket.io on the given HTTP server.
 * @param {import("http").Server} httpServer
 * @returns {import("socket.io").Server} io instance
 */
export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Apply JWT authentication middleware
  io.use(socketAuth);

  // Handle new connections
  io.on("connection", (socket) => {
    registerEventHandlers(io, socket);
  });

  logger.info("⚡ Socket.io initialized successfully");

  return io;
};

/**
 * Get the current Socket.io instance.
 * @returns {import("socket.io").Server}
 */
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io has not been initialized. Call initializeSocket first.");
  }
  return io;
};
