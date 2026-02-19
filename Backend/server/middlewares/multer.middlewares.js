import multer from "multer";
import path from "path";
import { ApiError } from "../Errors/APIErrors.js";

// ─── STORAGE ────────────────────────────────────────────────
// Save to a temp directory; Cloudinary upload will clean up afterwards.
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, "./tmp/uploads");
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
});

// ─── FILE FILTER ────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
];

const fileFilter = (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new ApiError(
                400,
                `Unsupported file type: ${file.mimetype}. Allowed: jpeg, png, webp, gif, svg`
            ),
            false
        );
    }
};

// ─── EXPORT ─────────────────────────────────────────────────
export const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
