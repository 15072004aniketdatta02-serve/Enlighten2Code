import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import {
  createPlayList,
  getPlayAllListDetails,
  getPlayListDetails,
  addProblemToPlaylist,
  deletePlayList,
  removeProblemFromPlaylist,
} from "../controllers/playlist.controllers.js";

const playlistRoutes = express.Router();

playlistRoutes.post("/create-playlist", authMiddleware, createPlayList);
playlistRoutes.get("/", authMiddleware, getPlayAllListDetails);
playlistRoutes.get("/:playlistId", authMiddleware, getPlayListDetails);
playlistRoutes.post("/:playlistId/add-problems", authMiddleware, addProblemToPlaylist);
playlistRoutes.delete("/:playlistId", authMiddleware, deletePlayList);
playlistRoutes.delete("/:playlistId/remove-problems", authMiddleware, removeProblemFromPlaylist);

export default playlistRoutes;
