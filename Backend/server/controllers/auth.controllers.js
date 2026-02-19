import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import  { db }  from "../database/dbconfig.js";
import { APIResponse } from "../APIStatuses/APIResponse.js";
import { ApiError } from "../Errors/APIErrors.js";
import { asyncHandler } from "../AsyncHandler/AsyncHandler.js";
import { UserRole } from "../src/generated/prisma/enums.ts";

// ─── REGISTER ────────────────────────────────────────────────
export const register = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        throw new ApiError(400, "Missing required fields: name, email, and password are all required");
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new ApiError(409, "User with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.user.create({
        data: { name, email, password: hashedPassword, role: UserRole.USER },
    });

    const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json(
        new APIResponse(201, {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            createdAt: newUser.createdAt,
            updatedAt: newUser.updatedAt,
        }, "User registered successfully")
    );
});

// ─── LOGIN ───────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Missing required fields: email and password are required");
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
        throw new ApiError(401, "Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid email or password");
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json(
        new APIResponse(200, {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        }, "Login successful")
    );
});

// ─── LOGOUT ──────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
    res.cookie("token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 0,
    });

    return res.status(200).json(
        new APIResponse(200, null, "Logged out successfully")
    );
});

// ─── GET CURRENT USER (Protected) ───────────────────────────
export const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await db.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            image: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new APIResponse(200, user, "User fetched successfully")
    );
});
