import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import cookieParser from "cookie-parser";
import helmet from 'helmet'
import cors from "cors";
import morgan from "morgan";
import logger from "../loggers/logger.js";
import { morganStream } from "../loggers/logger.js";
import router from "../routes/healthcheck.routes.js";
import authRoute from "../routes/auth.routes.js";
import { db } from "../database/dbconfig.js";
import { ApiError } from "../Errors/APIErrors.js";
dotenv.config();

// Ensure temp upload directory exists (Multer writes here before Cloudinary upload)
fs.mkdirSync("./tmp/uploads", { recursive: true });

const app = express();
const PORT = process.env.PORT || 5000;
app.use(helmet({crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan("combined", { stream: morganStream }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: `http://localhost:${PORT}`, credentials: true }));
app.use("/api/v1/healthcheck", router);
app.use("/api/v1/auth", authRoute);

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

    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error("❌ Failed to connect to the database:");
    logger.error(`   Error: ${error.message}`);
    if (error.code) logger.error(`   Code:  ${error.code}`);
    process.exit(1);
  });
