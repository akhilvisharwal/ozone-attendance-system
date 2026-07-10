import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors";
import { PROFILE_PHOTO_ALLOWED_MIME, PROFILE_PHOTO_MAX_BYTES } from "../utils/profilePhoto";

const storageEngine = multer.memoryStorage();

const multerInstance = multer({
  storage: storageEngine,
  limits: {
    fileSize: PROFILE_PHOTO_MAX_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!PROFILE_PHOTO_ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_PROFILE_PHOTO_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function normalizeError(err: unknown): ApiError {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return ApiError.badRequest("Profile picture must be 2 MB or smaller.");
    }
    return ApiError.badRequest(err.message);
  }
  if (err instanceof Error && err.message === "UNSUPPORTED_PROFILE_PHOTO_TYPE") {
    return ApiError.badRequest("Only JPG, PNG, or WebP images are allowed.");
  }
  return ApiError.badRequest("Could not process the uploaded profile picture.");
}

function wrap(middleware: (req: Request, res: Response, cb: (err: unknown) => void) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: unknown) => {
      if (err) return next(normalizeError(err));
      next();
    });
  };
}

export const profilePhotoUpload = {
  single: (field = "avatar") => wrap(multerInstance.single(field)),
};
