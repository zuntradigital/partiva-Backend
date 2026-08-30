import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { clearLastSeen, incrementTokenVersion } from "./auth.repository.js";
import * as authService from "./auth.service.js";

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    throw new ApiError(422, "VALIDATION_ERROR", "email and password are required");
  }

  try {
    const result = await authService.login(email, password);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // Logged here (not in the service) so the failure reason never needs to
    // touch the response -- same ApiError/status the client always got,
    // just also recorded server-side for brute-force/abuse monitoring.
    // Never logs the submitted password.
    if (error instanceof ApiError && error.errorCode === "INVALID_CREDENTIALS") {
      console.warn(
        "[security] failed_login",
        JSON.stringify({ email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null, at: new Date().toISOString() })
      );
    }
    throw error;
  }
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  await clearLastSeen(req.user!.userId);
  await incrementTokenVersion(req.user!.userId);

  res.status(200).json({ success: true, data: null });
});
