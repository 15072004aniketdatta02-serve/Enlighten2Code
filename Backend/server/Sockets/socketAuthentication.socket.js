import jwt from "jsonwebtoken";
import { db } from "../database/dbconfig.js";
import logger from "../loggers/logger.js";

/**
 * Socket.io JWT authentication middleware.
 * Verifies the token from the handshake (cookie or auth header)
 * and attaches the user object to socket.user.
 */
export const socketAuth = async (socket, next) => {
  try {
    // Try to get token from cookie or auth header
    let token = null;

    // From cookie (if using cookie-parser on handshake)
    const cookies = socket.handshake.headers.cookie;
    if (cookies) {
      const tokenCookie = cookies
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("jwt="));
      if (tokenCookie) {
        token = tokenCookie.split("=")[1];
      }
    }

    // From auth header (Bearer token) or handshake auth
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, role: true, image: true },
    });

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    socket.user = user;
    next();
  } catch (error) {
    logger.error("Socket auth error:", error.message);
    next(new Error("Authentication error: Invalid token"));
  }
};
