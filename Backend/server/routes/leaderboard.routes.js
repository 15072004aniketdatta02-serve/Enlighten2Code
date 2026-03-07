import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import {
  getGlobalLeaderboard,
  followUser,
  unfollowUser,
  getFriendsLeaderboard,
  compareUsers,
} from "../controllers/leaderboard.controller.js";

const leaderboardRoutes = express.Router();

leaderboardRoutes.get("/", authMiddleware, getGlobalLeaderboard);
leaderboardRoutes.post("/follow/:userId", authMiddleware, followUser);
leaderboardRoutes.delete("/follow/:userId", authMiddleware, unfollowUser);
leaderboardRoutes.get("/friends", authMiddleware, getFriendsLeaderboard);
leaderboardRoutes.get("/compare/:userId", authMiddleware, compareUsers);

export default leaderboardRoutes;
