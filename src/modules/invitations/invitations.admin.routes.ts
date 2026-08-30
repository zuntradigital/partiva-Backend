import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.middleware.js";
import { createInvitationHandler, listInvitationsHandler } from "./invitations.controller.js";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.post("/", createInvitationHandler);
router.get("/", listInvitationsHandler);

export default router;
