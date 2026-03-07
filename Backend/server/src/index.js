import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import http from "http";
import cookieParser from "cookie-parser";
import helmet from 'helmet'
import cors from "cors";
import morgan from "morgan";
import logger from "../loggers/logger.js";
import { morganStream } from "../loggers/logger.js";

// ─── Existing Route Imports ─────────────────────────────────
import router from "../routes/healthcheck.routes.js";
import authRoute from "../routes/auth.routes.js";
import problemRoutes from "../routes/problem.routes.js";
import submissionRoutes from "../routes/submission.routes.js";
import executionRoute from "../routes/executeCode.routes.js";
import playlistRoutes from "../routes/playlist.routes.js";

// ─── New Feature Route Imports ──────────────────────────────
import analyticsRoutes from "../routes/analytics.routes.js";
import aiRoutes from "../routes/aiAssistant.routes.js";
import contestRoutes from "../routes/contest.routes.js";
import discussionRoutes from "../routes/discussion.routes.js";
import leaderboardRoutes from "../routes/leaderboard.routes.js";
import runCodeRoutes from "../routes/runCode.routes.js";
import spacedRepetitionRoutes from "../routes/spacedRepetition.routes.js";
import adminRoutes from "../routes/admin.routes.js";

// ─── Webhook Routes ────────────────────────────────────────
import webhookRouter from "../webhooks/webhookRoutes.webhook.js";

// ─── Socket.io ──────────────────────────────────────────────
import { initializeSocket } from "../Sockets/socketManager.socket.js";

// ─── Core ───────────────────────────────────────────────────
import { db } from "../database/dbconfig.js";
import { ApiError } from "../Errors/APIErrors.js";

dotenv.config();

// Ensure temp upload directory exists (Multer writes here before Cloudinary upload)
fs.mkdirSync("./tmp/uploads", { recursive: true });

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Create HTTP server for Socket.io ───────────────────────
const server = http.createServer(app);

// ─── Initialize Socket.io ───────────────────────────────────
initializeSocket(server);

// ─── Middleware ─────────────────────────────────────────────
app.use(helmet({crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan("combined", { stream: morganStream }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || `http://localhost:${PORT}`,
  credentials: true,
}));

// ─── Existing Routes ────────────────────────────────────────
app.use("/api/v1/healthcheck", router);
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/problems", problemRoutes);
app.use("/api/v1/submissions", submissionRoutes);
app.use("/api/v1/execute", executionRoute);
app.use("/api/v1/playlists", playlistRoutes);

// ─── New Feature Routes ─────────────────────────────────────
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/contests", contestRoutes);
app.use("/api/v1/discussions", discussionRoutes);
app.use("/api/v1/leaderboard", leaderboardRoutes);
app.use("/api/v1/run-code", runCodeRoutes);
app.use("/api/v1/reviews", spacedRepetitionRoutes);
app.use("/api/v1/admin", adminRoutes);

// ─── Webhook Routes ────────────────────────────────────────
app.use("/api/v1/webhooks", webhookRouter);

// ─── Root Route ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('Enlighten2Code Server is running❤️!');
});

// Global error-handling middleware (must be after all routes)
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
  }
  logger.error("Unhandled error:", err);
  return res.status(500).json({
    success: false,
    statusCode: 500,
    message: "Internal Server Error",
  });
});

// Connect to the database, then start the server
db.$connect()
  .then(() => {
    const dbUrl = process.env.DATABASE_URL || "No DATABASE_URL set";
    // Mask credentials in the URL for safe logging
    const safeUrl = dbUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://*****:*****@");
    logger.info(`✅ DB connected successfully using: ${safeUrl}`);

    // Use the HTTP server (not app.listen) so Socket.io works
    server.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`⚡ Socket.io is ready for connections`);
    });
  })
  .catch((error) => {
    logger.error("❌ Failed to connect to the database:");
    logger.error(`   Error: ${error.message}`);
    if (error.code) logger.error(`   Code:  ${error.code}`);
    process.exit(1);
  });
