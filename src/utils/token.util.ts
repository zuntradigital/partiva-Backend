import crypto from "node:crypto";

// The raw token is what goes in the invitation link/email; only its SHA-256
// hash is ever persisted, so a leaked database row can't be used as a token.
export const generateInvitationToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashInvitationToken = (rawToken: string): string => {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
};
