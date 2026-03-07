import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import {
  getDashboard,
  getStreak,
  getTopicStrength,
  getSubmissionHeatmap,
} from "../controllers/analytics.controller.js";

const analyticsRoutes = express.Router();

analyticsRoutes.get("/dashboard", authMiddleware, getDashboard);
analyticsRoutes.get("/streak", authMiddleware, getStreak);
analyticsRoutes.get("/topic-strength", authMiddleware, getTopicStrength);
analyticsRoutes.get("/submission-heatmap", authMiddleware, getSubmissionHeatmap);

export default analyticsRoutes;
