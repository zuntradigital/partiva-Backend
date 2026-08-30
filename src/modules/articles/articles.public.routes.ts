import { Router } from "express";
import { getPublishedArticleHandler, listPublishedArticlesHandler } from "./articles.controller.js";

const router = Router();

router.get("/", listPublishedArticlesHandler);
router.get("/:slug", getPublishedArticleHandler);

export default router;
