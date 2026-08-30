import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { loginHandler, logoutHandler } from "./auth.controller.js";

const router = Router();

router.post("/login", loginHandler);
router.post("/logout", requireAuth, logoutHandler);

export default router;
