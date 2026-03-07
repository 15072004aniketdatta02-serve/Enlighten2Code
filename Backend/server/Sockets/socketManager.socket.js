import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { socketAuth } from "./socketAuthentication.socket.js";
import { registerEventHandlers } from "./socketEventHandlers.socket.js";
import { getRedis, isRedisConnected } from "../libs/redis.lib.js";
import logger from "../loggers/logger.js";

let io;

/**
 * Initialize Socket.io on the given HTTP server.
 * Attaches Redis adapter for horizontal scaling when Redis is available.
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

  // Redis adapter (horizontal scaling)
  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      if (redis.status !== "noop") {
        const pub = redis.duplicate();
        const sub = redis.duplicate();
        io.adapter(createAdapter(pub, sub));
        logger.info("⚡ Socket.io Redis adapter enabled");
      }
    } catch (e) {
      logger.warn("Socket.io Redis adapter failed — single-instance:", e.message);
    }
  }

  io.use(socketAuth);
  io.on("connection", (socket) => registerEventHandlers(io, socket));

  logger.info("⚡ Socket.io initialised");
  return io;
};

/**
 * Get the current Socket.io instance.
 */
export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
};
