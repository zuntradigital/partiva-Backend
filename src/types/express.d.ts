import type { AuthTokenPayload } from "../utils/jwt.util.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export {};
