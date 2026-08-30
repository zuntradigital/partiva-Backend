import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/apiError.js";

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error_code: "NOT_FOUND",
    message: `No route for ${req.method} ${req.originalUrl}`,
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      error_code: error.errorCode,
      message: error.message,
    });
    return;
  }

  console.error("Unhandled error:", error);

  res.status(500).json({
    success: false,
    error_code: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};
