import express from "express";
import { authMiddleware, checkAdmin } from "../middlewares/auth.middlewares.js";
import {
  createContest,
  getAllContests,
  getContestById,
  registerForContest,
  submitContestSolution,
  getContestLeaderboard,
  deleteContest,
} from "../controllers/contest.controller.js";

const contestRoutes = express.Router();

contestRoutes.post("/create", authMiddleware, checkAdmin, createContest);
contestRoutes.get("/", authMiddleware, getAllContests);
contestRoutes.get("/:id", authMiddleware, getContestById);
contestRoutes.post("/:id/register", authMiddleware, registerForContest);
contestRoutes.post("/:id/submit", authMiddleware, submitContestSolution);
contestRoutes.get("/:id/leaderboard", authMiddleware, getContestLeaderboard);
contestRoutes.delete("/:id", authMiddleware, checkAdmin, deleteContest);

export default contestRoutes;
