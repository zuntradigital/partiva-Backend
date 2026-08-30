import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  createArticleHandler,
  deleteArticleHandler,
  getArticleHandler,
  listArticlesHandler,
  transitionArticleStatusHandler,
  updateArticleHandler,
} from "./articles.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requirePermission("articles", "view"), listArticlesHandler);
router.get("/:id", requirePermission("articles", "view"), getArticleHandler);
router.post("/", requirePermission("articles", "create"), createArticleHandler);
router.put("/:id", requirePermission("articles", "edit"), updateArticleHandler);
router.delete("/:id", requirePermission("articles", "delete"), deleteArticleHandler);
// Status-transition permission is action-specific and checked inside the service
// (submit_review/approve/publish/archive each require a different permission).
router.patch("/:id/status", transitionArticleStatusHandler);

export default router;
