import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadSizeMb * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_RECEIPT_FILE_TYPE"));
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
    return ApiError.badRequest(err.message);
  }
  if (err instanceof Error && err.message === "UNSUPPORTED_RECEIPT_FILE_TYPE") {
    return ApiError.badRequest("Only JPEG, PNG, WEBP images and PDF files are allowed for receipts.");
  }
  return ApiError.badRequest("Could not process the uploaded receipt.");
}

function wrap(middleware: (req: Request, res: Response, cb: (err: unknown) => void) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: unknown) => {
      if (err) return next(normalizeUploadError(err));
      next();
    });
  };
}

export const expenseUpload = {
  single: (field: string) => wrap(multerInstance.single(field)),
};
