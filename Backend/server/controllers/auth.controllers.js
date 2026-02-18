import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../database/dbconfig.js";
import { OAuth2Client } from "google-auth-library";
import { APIResponse } from "../APIStatuses/APIResponse.js";
import { ApiError } from "../Errors/APIErrors.js";
import { asyncHandler } from "../AsyncHandler/AsyncHandler.js";






export const register = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    try {
        if (!name || !email || !password) {
            throw new ApiError(400, "Bad Request", "Missing required fields");
        }
        const user = await db.user.findUnique({ where: { email } });
        if (user) {
            throw new ApiError(400, "Bad Request", "User already exists");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await db.user.create({ data: { name, email, password: hashedPassword, role: "USER" }});
        const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
        res.cookie("jwt", token, {
            httpOnly: true,
            secure:process.env.NODE_ENV !== "development",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.json({
            status: "success",
            message: "User registered successfully",
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                createdAt: newUser.createdAt,
                updatedAt: newUser.updatedAt
             }
        });
    } catch (error) {
        throw new ApiError(500, "Internal Server Error", error.message);
    }
});

