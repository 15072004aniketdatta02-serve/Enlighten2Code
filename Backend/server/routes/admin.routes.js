import express from "express";
import { authMiddleware, checkAdmin } from "../middlewares/auth.middlewares.js";
import {
  getPlatformStats,
  getAllUsers,
  updateUserRole,
  banUser,
} from "../controllers/admin.controller.js";

const adminRoutes = express.Router();

// All admin routes require authentication + admin role
adminRoutes.get("/stats", authMiddleware, checkAdmin, getPlatformStats);
adminRoutes.get("/users", authMiddleware, checkAdmin, getAllUsers);
adminRoutes.patch("/users/:id/role", authMiddleware, checkAdmin, updateUserRole);
adminRoutes.patch("/users/:id/ban", authMiddleware, checkAdmin, banUser);

export default adminRoutes;
