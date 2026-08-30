import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes.js";
import rolesRoutes from "./modules/roles/roles.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import invitationsAdminRoutes from "./modules/invitations/invitations.admin.routes.js";
import invitationsPublicRoutes from "./modules/invitations/invitations.public.routes.js";
import categoriesRoutes from "./modules/categories/categories.routes.js";
import tagsRoutes from "./modules/tags/tags.routes.js";
import articlesAdminRoutes from "./modules/articles/articles.admin.routes.js";
import articlesPublicRoutes from "./modules/articles/articles.public.routes.js";
import { adminPricingRouter, publicPricingRouter } from "./modules/pricing/pricing.routes.js";
import { adminReviewsRouter, publicReviewsRouter } from "./modules/reviews/reviews.routes.js";
import { adminFaqRouter, publicFaqRouter } from "./modules/faq/faq.routes.js";
import { adminContactRouter, publicContactRouter } from "./modules/contact/contact.routes.js";
import { adminPagesRouter, publicPagesRouter } from "./modules/pages/pages.routes.js";
import { adminMediaRouter, publicMediaRouter } from "./modules/media/media.routes.js";
import { adminAuditRouter, adminNotificationsRouter } from "./modules/audit/audit.routes.js";
import { auditLogMiddleware } from "./middleware/auditLog.middleware.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { env } from "./config/env.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.allowedOrigins,
    credentials: true,
  })
);

// Inline article images and the featured cover are now uploaded from the
// admin's device and embedded as base64 data URLs in the JSON body, so the
// limit must fit a few photos, not just text.
app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());

// Brute-force protection on login, distinct from the general API limiter below.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error_code: "TOO_MANY_REQUESTS", message: "Too many login attempts, try again later" },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 300 was tuned for occasional API traffic, but the Dashboard (search,
  // notifications, per-page data fetches) and the public Website share this
  // same limiter and IP, and both fire many requests per normal session --
  // real admin usage was tripping this within minutes. 3000 still bounds
  // scripted abuse while comfortably covering legitimate browsing.
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error_code: "TOO_MANY_REQUESTS", message: "Too many requests, try again later" },
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", loginLimiter);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Partiva Admin Backend is running",
  });
});

app.use("/api/auth", authRoutes);

// Generically records every successful /api/admin/* mutation into the audit
// log, regardless of which module handles it -- must run after requireAuth
// (applied per-router below) sets req.user, which it does since res.json is
// only invoked once the route handler runs.
app.use("/api/admin", auditLogMiddleware);

app.use("/api/admin/roles", rolesRoutes);
app.use("/api/admin/users", usersRoutes);
app.use("/api/admin/invitations", invitationsAdminRoutes);
app.use("/api/invitations", invitationsPublicRoutes);
app.use("/api/admin/categories", categoriesRoutes);
app.use("/api/admin/tags", tagsRoutes);
app.use("/api/admin/articles", articlesAdminRoutes);
app.use("/api/articles", articlesPublicRoutes);
app.use("/api/pricing", publicPricingRouter);
app.use("/api/admin/pricing", adminPricingRouter);
app.use("/api/testimonials", publicReviewsRouter);
app.use("/api/admin/testimonials", adminReviewsRouter);
app.use("/api/faq", publicFaqRouter);
app.use("/api/admin/faq", adminFaqRouter);
app.use("/api/contact", publicContactRouter);
app.use("/api/admin/contact", adminContactRouter);
app.use("/api/admin/audit", adminAuditRouter);
app.use("/api/admin/notifications", adminNotificationsRouter);
app.use("/api/pages", publicPagesRouter);
app.use("/api/admin/pages", adminPagesRouter);
app.use("/api/media", publicMediaRouter);
app.use("/api/admin/media", adminMediaRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
