import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import { runCode } from "../controllers/runCode.controller.js";

const runCodeRoutes = express.Router();

runCodeRoutes.post("/", authMiddleware, runCode);

export default runCodeRoutes;
