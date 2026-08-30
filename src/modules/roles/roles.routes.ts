import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.middleware.js";
import { createRoleHandler, listRolesHandler, permissionRegistryHandler, updateRoleHandler } from "./roles.controller.js";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/", listRolesHandler);
router.get("/permissions/registry", permissionRegistryHandler);
router.post("/", createRoleHandler);
router.put("/:id", updateRoleHandler);

export default router;
