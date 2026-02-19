import express from "express";
import { register, login, logout, getCurrentUser, updateProfileImage } from "../controllers/auth.controllers.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";
import { upload } from "../middlewares/multer.middlewares.js";

const authRoute = express.Router();

// Public
authRoute.route("/register").post(upload.single("image"), register);
authRoute.route("/login").post(login);
authRoute.route("/logout").post(logout);

// Protected
authRoute.route("/me").get(verifyJWT, getCurrentUser);
authRoute.route("/profile-image").patch(verifyJWT, upload.single("image"), updateProfileImage);

export default authRoute;