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

// ─── Route Imports ──────────────────────────────────────────
import router from "../routes/healthcheck.routes.js";
import authRoute from "../routes/auth.routes.js";
import problemRoutes from "../routes/problem.routes.js";
import submissionRoutes from "../routes/submission.routes.js";
import executionRoute from "../routes/executeCode.routes.js";
import playlistRoutes from "../routes/playlist.routes.js";
import analyticsRoutes from "../routes/analytics.routes.js";
import aiRoutes from "../routes/aiAssistant.routes.js";
import contestRoutes from "../routes/contest.routes.js";
import discussionRoutes from "../routes/discussion.routes.js";
import leaderboardRoutes from "../routes/leaderboard.routes.js";
import runCodeRoutes from "../routes/runCode.routes.js";
import spacedRepetitionRoutes from "../routes/spacedRepetition.routes.js";
import adminRoutes from "../routes/admin.routes.js";
import webhookRouter from "../webhooks/webhookRoutes.webhook.js";

// ─── Socket.io ──────────────────────────────────────────────
import { initializeSocket } from "../Sockets/socketManager.socket.js";

// ─── Redis ──────────────────────────────────────────────────
import { connectRedis, disconnectRedis } from "../libs/redis.lib.js";
import { rateLimiters } from "../middlewares/rateLimit.middleware.js";

// ─── Kafka ──────────────────────────────────────────────────
import { connectKafka, disconnectKafka } from "../libs/kafka.lib.js";
import { startSubmissionConsumer } from "../libs/handlers/submissionEvents.handler.js";
import { startAnalyticsConsumer } from "../libs/handlers/analyticsEvents.handler.js";
import { startNotificationConsumer } from "../libs/handlers/notificationEvents.handler.js";

// ─── BullMQ ─────────────────────────────────────────────────
import { initQueues, shutdownQueues } from "../libs/bullmq.lib.js";

// ─── gRPC ───────────────────────────────────────────────────
import { startGrpcServer, stopGrpcServer } from "../libs/grpc.lib.js";

// ─── Core ───────────────────────────────────────────────────
import { db } from "../database/dbconfig.js";
import { ApiError } from "../Errors/APIErrors.js";

dotenv.config();

fs.mkdirSync("./tmp/uploads", { recursive: true });

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// ─── Middleware ─────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan("combined", { stream: morganStream }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || `http://localhost:${PORT}`,
  credentials: true,
}));

// Global rate limiter (Redis-backed, silently skips if Redis is down)
app.use(rateLimiters.general);

// ─── Routes ─────────────────────────────────────────────────
app.use("/api/v1/healthcheck", router);
app.use("/api/v1/auth", rateLimiters.auth, authRoute);
app.use("/api/v1/problems", problemRoutes);
app.use("/api/v1/submissions", submissionRoutes);
app.use("/api/v1/execute", rateLimiters.execution, executionRoute);
app.use("/api/v1/playlists", playlistRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/ai", rateLimiters.ai, aiRoutes);
app.use("/api/v1/contests", contestRoutes);
app.use("/api/v1/discussions", discussionRoutes);
app.use("/api/v1/leaderboard", leaderboardRoutes);
app.use("/api/v1/run-code", rateLimiters.execution, runCodeRoutes);
app.use("/api/v1/reviews", spacedRepetitionRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/webhooks", webhookRouter);

app.get('/', (_req, res) => res.send('Enlighten2Code Server is running ❤️'));

// ─── Error Handler ──────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false, statusCode: err.statusCode,
      message: err.message, errors: err.errors,
    });
  }
  logger.error("Unhandled error:", err);
  return res.status(500).json({ success: false, statusCode: 500, message: "Internal Server Error" });
});

// ═════════════════════════════════════════════════════════════
//  Startup: DB → Redis → Socket.io → Kafka → BullMQ → gRPC → HTTP
// ═════════════════════════════════════════════════════════════
const startServer = async () => {
  try {
    // 1. Database
    await db.$connect();
    const safeUrl = (process.env.DATABASE_URL || "").replace(/:\/\/([^:]+):([^@]+)@/, "://*****:*****@");
    logger.info(`✅ DB connected: ${safeUrl}`);

    // 2. Redis (optional)
    await connectRedis();

    // 3. Socket.io (uses Redis adapter if Redis is up)
    initializeSocket(server);

    // 4. Kafka (optional)
    await connectKafka();

    // 5. Kafka consumers (only if Kafka connected)
    await startSubmissionConsumer();
    await startAnalyticsConsumer();
    await startNotificationConsumer();

    // 6. BullMQ (only if Redis connected)
    initQueues();

    // 7. gRPC
    startGrpcServer();

    // 8. HTTP
    server.listen(PORT, () => {
      logger.info(`🚀 Server listening on port ${PORT}`);
      logger.info(`⚡ Socket.io ready`);
    });
  } catch (error) {
    logger.error("❌ Startup failed:", error.message);
    if (error.code) logger.error(`   Code: ${error.code}`);
    process.exit(1);
  }
};

// ─── Graceful Shutdown ──────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down…`);
  try {
    server.close();
    stopGrpcServer();
    await shutdownQueues();
    await disconnectKafka();
    await disconnectRedis();
    await db.$disconnect();
    logger.info("✅ All connections closed");
    process.exit(0);
  } catch (e) {
    logger.error("Shutdown error:", e);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

startServer();

