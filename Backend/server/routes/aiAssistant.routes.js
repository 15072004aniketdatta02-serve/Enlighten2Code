import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import {
  getHint,
  reviewCode,
  explainSolution,
} from "../controllers/aiAssistant.controller.js";

const aiRoutes = express.Router();

aiRoutes.post("/hint", authMiddleware, getHint);
aiRoutes.post("/review", authMiddleware, reviewCode);
aiRoutes.post("/explain", authMiddleware, explainSolution);

export default aiRoutes;
