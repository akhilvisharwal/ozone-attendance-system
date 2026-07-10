import sharp from "sharp";
import { ApiError } from "../utils/errors";

export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Validates and compresses a profile photo to WebP (max 512×512, ~2MB input). */
export async function processProfilePhoto(input: {
  buffer: Buffer;
  mimetype: string;
  originalName?: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const ext = (input.originalName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const mimeFromExt =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : null;
  const mimetype =
    PROFILE_PHOTO_ALLOWED_MIME.has(input.mimetype) ? input.mimetype : mimeFromExt ?? input.mimetype;

  if (!PROFILE_PHOTO_ALLOWED_MIME.has(mimetype)) {
    throw ApiError.badRequest("Only JPG, PNG, or WebP images are allowed.");
  }
  if (input.buffer.length > PROFILE_PHOTO_MAX_BYTES) {
    throw ApiError.badRequest("Profile picture must be 2 MB or smaller.");
  }

  try {
    const image = sharp(input.buffer, { failOn: "truncated" }).rotate();
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      throw ApiError.badRequest("Could not read the image. Please try another file.");
    }

    const buffer = await image
      .resize(512, 512, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: false,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    if (buffer.length === 0) {
      throw ApiError.badRequest("Could not process the image. Please try another file.");
    }

    return { buffer, filename: "avatar.webp" };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest("Invalid image file. Please upload a valid JPG, PNG, or WebP.");
  }
}
