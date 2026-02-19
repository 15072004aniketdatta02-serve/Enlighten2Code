import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// ─── CONFIGURE ──────────────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── UPLOAD ─────────────────────────────────────────────────
/**
 * Uploads a local file to Cloudinary, then removes the temp file.
 * @param {string} localFilePath - Absolute path to the file on disk.
 * @param {string} [folder="enlighten2code"] - Cloudinary folder name.
 * @returns {Promise<{url: string, publicId: string}>}
 */
export const uploadToCloudinary = async (localFilePath, folder = "enlighten2code") => {
    if (!localFilePath) return null;

    try {
        const result = await cloudinary.uploader.upload(localFilePath, {
            folder,
            resource_type: "auto",          // auto-detect image / video / raw
            transformation: [
                { width: 500, height: 500, crop: "limit" },   // cap resolution
                { quality: "auto", fetch_format: "auto" },     // optimise
            ],
        });

        return { url: result.secure_url, publicId: result.public_id };
    } finally {
        // Always clean up the temp file, even if upload fails
        fs.unlink(localFilePath, () => {});
    }
};

// ─── DELETE ─────────────────────────────────────────────────
/**
 * Removes an asset from Cloudinary by its public_id.
 * @param {string} publicId
 */
export const deleteFromCloudinary = async (publicId) => {
    if (!publicId) return null;
    return cloudinary.uploader.destroy(publicId);
};

export default cloudinary;
