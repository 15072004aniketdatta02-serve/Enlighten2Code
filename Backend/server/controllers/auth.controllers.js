import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../database/dbconfig.js";
import { APIResponse } from "../APIStatuses/APIResponse.js";
import { ApiError } from "../Errors/APIErrors.js";
import { asyncHandler } from "../AsyncHandler/AsyncHandler.js";
import { UserRole } from "../src/generated/prisma/enums.ts";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

// ─── Helper: set JWT cookie ─────────────────────────────────
const setTokenCookie = (res, userId) => {
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return token;
};

// ─── Helper: sanitise user for API response ─────────────────
const sanitiseUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    image: user.image ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

// ─── REGISTER ────────────────────────────────────────────────
export const register = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        throw new ApiError(400, "Missing required fields: name, email, and password are all required");
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new ApiError(409, "User already exists");
    }

    // ── Upload profile image to Cloudinary (optional) ──
    let imageUrl = null;
    if (req.file) {
        const uploaded = await uploadToCloudinary(req.file.path, "enlighten2code/avatars");
        if (uploaded) imageUrl = uploaded.url;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role: UserRole.USER,
            image: imageUrl,
        },
    });

    setTokenCookie(res, newUser.id);

    return res.status(201).json(
        new APIResponse(201, sanitiseUser(newUser), "User registered successfully")
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

    setTokenCookie(res, user.id);

    return res.status(200).json(
        new APIResponse(200, sanitiseUser(user), "Login successful")
    );
});

// ─── LOGOUT ──────────────────────────────────────────────────
export const logout = asyncHandler(async (_req, res) => {
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

// ─── UPDATE PROFILE IMAGE (Protected) ───────────────────────
export const updateProfileImage = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, "No image file provided");
    }

    // Fetch existing user to check for old image
    const existingUser = await db.user.findUnique({
        where: { id: req.user.id },
        select: { image: true },
    });

    // Upload the new image
    const uploaded = await uploadToCloudinary(req.file.path, "enlighten2code/avatars");
    if (!uploaded) {
        throw new ApiError(500, "Failed to upload image to Cloudinary");
    }

    // Delete old image from Cloudinary if it exists
    if (existingUser?.image) {
        // Extract public_id from the old Cloudinary URL
        // URL format: https://res.cloudinary.com/<cloud>/image/upload/v.../folder/filename.ext
        const segments = existingUser.image.split("/");
        const folderAndFile = segments.slice(segments.indexOf("upload") + 2).join("/");
        const publicId = folderAndFile.replace(/\.[^/.]+$/, ""); // strip extension
        await deleteFromCloudinary(publicId).catch(() => {}); // best-effort cleanup
    }

    // Persist the new URL
    const updatedUser = await db.user.update({
        where: { id: req.user.id },
        data: { image: uploaded.url },
    });

    return res.status(200).json(
        new APIResponse(200, sanitiseUser(updatedUser), "Profile image updated successfully")
    );
});
