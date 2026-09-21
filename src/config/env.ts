import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 5000,

  dbHost: process.env.DB_HOST || "localhost",
  dbPort: Number(process.env.DB_PORT) || 3306,
  dbUser: process.env.DB_USER || "",
  dbPassword: process.env.DB_PASSWORD || "",
  dbName: process.env.DB_NAME || "",

  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  invitationTokenExpiryHours: Number(process.env.INVITATION_TOKEN_EXPIRY_HOURS) || 48,

  // Base URL of the admin frontend, used to build the invitation accept link.
  // Local dev port map: Dashboard runs on 3001 (see partiva-dashboard's
  // package.json) -- not 3000, which is reserved for the separate Core
  // Platform Frontend and never talks to this backend.
  adminAppUrl: process.env.ADMIN_APP_URL || "http://localhost:3001",

  // Browser origins allowed to call this API with credentials (comma-separated).
  // Dashboard (3001) and the public Website (3002) both call public API
  // endpoints from the browser -- see the project-wide local port map.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3001,http://localhost:3002")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "",
  },
};

const requiredVars: Array<[string, string]> = [
  ["JWT_SECRET", env.jwtSecret],
  ["SMTP_HOST", env.smtp.host],
  ["SMTP_USER", env.smtp.user],
  ["SMTP_PASSWORD", env.smtp.password],
  ["SMTP_FROM", env.smtp.from],
  // Checked against the raw env var, not env.adminAppUrl -- that already has
  // the localhost fallback baked in, so it's never falsy and would never
  // trip this check. Without ADMIN_APP_URL set, nothing crashes at request
  // time; it just silently mails invite links that 404 for every recipient.
  // Required here so that failure mode is a loud startup error instead of a
  // support ticket.
  ["ADMIN_APP_URL", process.env.ADMIN_APP_URL || ""],
];

const missing = requiredVars.filter(([, value]) => !value).map(([name]) => name);

if (missing.length > 0) {
  throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
}
