import { Router } from "express";
import { verifyInvitationHandler, acceptInvitationHandler } from "./invitations.controller.js";

const router = Router();

router.get("/verify", verifyInvitationHandler);
router.post("/accept", acceptInvitationHandler);

export default router;
