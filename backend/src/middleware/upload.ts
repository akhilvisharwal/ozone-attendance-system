import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const storageEngine = multer.memoryStorage();

const multerInstance = multer({
  storage: storageEngine,
  limits: {
    fileSize: env.maxUploadSizeMb * 1024 * 1024,
    files: 6,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function normalizeUploadError(err: unknown): ApiError {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return ApiError.badRequest(`File is too large. Maximum size is ${env.maxUploadSizeMb}MB.`);
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return ApiError.badRequest("Too many files uploaded.");
    }
    return ApiError.badRequest(err.message);
  }
  if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
    return ApiError.badRequest("Only JPEG, PNG, or WEBP images are allowed.");
  }
  return ApiError.badRequest("Could not process the uploaded file(s).");
}

/** Wraps multer middleware so upload errors become proper 400 ApiErrors instead of 500s. */
function wrap(middleware: (req: Request, res: Response, cb: (err: unknown) => void) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: unknown) => {
      if (err) return next(normalizeUploadError(err));
      next();
    });
  };
}

export const upload = {
  single: (field: string) => wrap(multerInstance.single(field)),
  array: (field: string, maxCount: number) => wrap(multerInstance.array(field, maxCount)),
};
