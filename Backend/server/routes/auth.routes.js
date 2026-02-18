import express from "express";
const authRoute = express.Router();

import { register } from "../controllers/auth.controllers.js";
authRoute.post("/register", register);
// authRoute.post("/login", login);
// authRoute.post("/refresh-token", refreshToken);
// authRoute.post("/logout", logout);
// authRoute.post("/google", google);
// authRoute.post("/github", github);
// authRoute.post("/linkedin", linkedin);
// authRoute.post("/forgot-password", forgotPassword);
// authRoute.post("/reset-password", resetPassword);
// authRoute.post("/verify-email", verifyEmail);
// authRoute.post("/send-verification-email", sendVerificationEmail);
// authRoute.get("/check", check);
export default authRoute;