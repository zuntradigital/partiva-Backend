import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.middleware.js";
import {
  deleteUserHandler,
  getUserPermissionsHandler,
  listUsersHandler,
  updateUserPermissionsHandler,
} from "./users.controller.js";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/", listUsersHandler);
router.get("/:id/permissions", getUserPermissionsHandler);
router.put("/:id/permissions", updateUserPermissionsHandler);
router.delete("/:id", deleteUserHandler);

export default router;
