import express from "express";
import { register, login, logout, getCurrentUser } from "../controllers/auth.controllers.js";
import { authMiddleware, verifyJWT } from "../middlewares/auth.middlewares.js";

const authRoute = express.Router();

authRoute.route("/register").post(register);
authRoute.route("/login").post(login);
authRoute.route("/logout").post(logout);
authRoute.route("/me").get(verifyJWT, getCurrentUser);

export default authRoute;