import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { createTagHandler, listTagsHandler, setTagArchivedHandler, updateTagHandler } from "./tags.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requirePermission("categories_tags", "view"), listTagsHandler);
router.post("/", requirePermission("categories_tags", "create"), createTagHandler);
router.put("/:id", requirePermission("categories_tags", "edit"), updateTagHandler);
router.patch("/:id/archived", requirePermission("categories_tags", "archive"), setTagArchivedHandler);

export default router;
