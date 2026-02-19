import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from 'helmet'
import cors from "cors";
import router from "../routes/healthcheck.routes.js";
import authRoute from "../routes/auth.routes.js";
import { db } from "../database/dbconfig.js";
import { ApiError } from "../Errors/APIErrors.js";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// app.use(cors({ origin: `http://localhost:${PORT}`, credentials: true }));
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
  console.error("Unhandled error:", err);
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
    console.log(`✅ DB connected successfully using: ${safeUrl}`);

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to connect to the database:");
    console.error(`   Error: ${error.message}`);
    if (error.code) console.error(`   Code:  ${error.code}`);
    process.exit(1);
  });
