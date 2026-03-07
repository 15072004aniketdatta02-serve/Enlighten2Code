import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import {
  createDiscussion,
  getDiscussions,
  getDiscussionById,
  replyToDiscussion,
  voteOnDiscussion,
  deleteDiscussion,
} from "../controllers/discussion.controller.js";

const discussionRoutes = express.Router();

discussionRoutes.post("/", authMiddleware, createDiscussion);
discussionRoutes.get("/problem/:problemId", authMiddleware, getDiscussions);
discussionRoutes.get("/:id", authMiddleware, getDiscussionById);
discussionRoutes.post("/:id/reply", authMiddleware, replyToDiscussion);
discussionRoutes.post("/:id/vote", authMiddleware, voteOnDiscussion);
discussionRoutes.delete("/:id", authMiddleware, deleteDiscussion);

export default discussionRoutes;
