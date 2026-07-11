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
    if (err.statusCode >= 500) {
      console.error(`[api-error ${err.statusCode}] ${req.method} ${req.originalUrl}:`, err.message);
      if (err.stack) console.error(err.stack);
      if (err.details) console.error("[api-error details]", err.details);
    }
    return res.status(err.statusCode).json({
      error: { message: err.message, details: err.details },
    });
  }

  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  const message =
    err instanceof Error && err.message.trim()
      ? err.message
      : "Internal server error";
  return res.status(500).json({
    error: {
      message,
      ...(env.isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
    },
  });
}
