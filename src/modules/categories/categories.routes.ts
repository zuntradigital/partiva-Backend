import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import {
  createCategoryHandler,
  listCategoriesHandler,
  setCategoryArchivedHandler,
  updateCategoryHandler,
} from "./categories.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requirePermission("categories_tags", "view"), listCategoriesHandler);
router.post("/", requirePermission("categories_tags", "create"), createCategoryHandler);
router.put("/:id", requirePermission("categories_tags", "edit"), updateCategoryHandler);
router.patch("/:id/archived", requirePermission("categories_tags", "archive"), setCategoryArchivedHandler);

export default router;
