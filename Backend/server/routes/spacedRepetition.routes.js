import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import {
  scheduleReview,
  getDueReviews,
  markReviewed,
  getReviewHistory,
} from "../controllers/spacedRepetition.controller.js";

const spacedRepetitionRoutes = express.Router();

spacedRepetitionRoutes.post("/schedule", authMiddleware, scheduleReview);
spacedRepetitionRoutes.get("/due", authMiddleware, getDueReviews);
spacedRepetitionRoutes.patch("/:id/reviewed", authMiddleware, markReviewed);
spacedRepetitionRoutes.get("/history", authMiddleware, getReviewHistory);

export default spacedRepetitionRoutes;
