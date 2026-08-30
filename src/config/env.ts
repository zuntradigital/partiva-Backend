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

  // Base URL of the admin frontend, used to build the invitation accept link
  adminAppUrl: process.env.ADMIN_APP_URL || "http://localhost:3000",

  // Browser origins allowed to call this API with credentials (comma-separated).
  // Dashboard and public website both call public API endpoints from the browser.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
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
];

const missing = requiredVars.filter(([, value]) => !value).map(([name]) => name);

if (missing.length > 0) {
  throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
}
