import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/apiError.js";
import { verifyAuthToken } from "../utils/jwt.util.js";
import { findAdminUserById, getRoleNamesForUser, touchLastSeen } from "../modules/auth/auth.repository.js";

const SUPER_ADMIN_ROLE = "Super Admin";

// Recording "last seen" on every single authenticated request would hammer the
// DB for no benefit -- the online-status window (see users.repository.ts) is
// minutes wide, so a write at most once per this interval is plenty.
const LAST_SEEN_THROTTLE_MS = 20_000;
const lastSeenUpdatedAt = new Map<number, number>();

const touchLastSeenThrottled = (userId: number): void => {
  const now = Date.now();
  const last = lastSeenUpdatedAt.get(userId) ?? 0;
  if (now - last < LAST_SEEN_THROTTLE_MS) return;

  lastSeenUpdatedAt.set(userId, now);
  touchLastSeen(userId).catch((error) => {
    console.error(`Failed to update last_seen_at for user ${userId}:`, error instanceof Error ? error.message : error);
  });
};

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHENTICATED", "Missing or invalid Authorization header");
  }

  const token = authHeader.slice("Bearer ".length).trim();

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid or expired session token");
  }

  // Re-checked against the DB on every request instead of trusting the
  // roles baked into the token at login time, so a disabled/deleted user or
  // a role change takes effect immediately rather than only once the token
  // naturally expires.
  const user = await findAdminUserById(payload.userId);
  if (!user || user.status !== "active" || user.token_version !== payload.tokenVersion) {
    throw new ApiError(401, "UNAUTHENTICATED", "Invalid or expired session token");
  }
  const roles = await getRoleNamesForUser(payload.userId);

  req.user = { userId: payload.userId, email: user.email, roles };
  touchLastSeenThrottled(payload.userId);
  next();
};

export const requireSuperAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?.roles.includes(SUPER_ADMIN_ROLE)) {
    console.warn(
      "[security] permission_denied",
      JSON.stringify({ userId: req.user?.userId ?? null, roles: req.user?.roles ?? [], resource: "super_admin_only", ip: req.ip, at: new Date().toISOString() })
    );
    throw new ApiError(403, "FORBIDDEN", "Only a Super Admin can perform this action");
  }

  next();
};
