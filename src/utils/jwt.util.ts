import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthTokenPayload {
  userId: number;
  email: string;
  roles: string[];
  // Compared against admin_users.token_version on every request (see
  // requireAuth) -- incrementing that column (on logout) makes every
  // previously-issued token for that user fail verification immediately,
  // instead of only once it naturally expires. Optional only because this
  // type doubles as req.user's shape (via express.d.ts), which never needs
  // it; signAuthToken's only call site always provides it.
  tokenVersion?: number;
}

export const signAuthToken = (payload: AuthTokenPayload): string => {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
};

export const verifyAuthToken = (token: string): AuthTokenPayload => {
  // Pin the accepted algorithm to the one this app actually signs with --
  // every token issued by signAuthToken() is HS256, so this rejects nothing
  // legitimate while closing off algorithm-confusion attacks.
  return jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as AuthTokenPayload;
};
