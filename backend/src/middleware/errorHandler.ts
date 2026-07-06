import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/errors";
import { env } from "../config/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    // Surface the actual field messages instead of a generic "Validation failed".
    const message = details.map((d) => d.message).filter(Boolean).join(" ") || "Validation failed";
    return res.status(400).json({
      error: { message, details },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { message: err.message, details: err.details },
    });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: {
      message: "Internal server error",
      ...(env.isProduction ? {} : { stack: (err as Error)?.stack }),
    },
  });
}
