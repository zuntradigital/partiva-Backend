import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as articlesService from "./articles.service.js";

function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid article id");
  return id;
}

// ---- Admin ----

export const listArticlesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const articles = await articlesService.listArticles();
  res.status(200).json({ success: true, data: articles });
});

export const getArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  const article = await articlesService.getArticle(parseId(req));
  res.status(200).json({ success: true, data: article });
});

export const createArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  const article = await articlesService.createArticle((req.body ?? {}) as Record<string, unknown>, req.user!.userId);
  res.status(201).json({ success: true, data: article });
});

export const updateArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  const article = await articlesService.updateArticle(parseId(req), req.user!.userId, req.user!.roles, (req.body ?? {}) as Record<string, unknown>);
  res.status(200).json({ success: true, data: article });
});

export const deleteArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(req);
  await articlesService.deleteArticle(id);
  res.status(200).json({ success: true, data: { id } });
});

export const transitionArticleStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(req);
  const article = await articlesService.transitionArticleStatus(
    id,
    req.user!.userId,
    req.user!.roles,
    (req.body ?? {}) as Record<string, unknown>
  );
  res.status(200).json({ success: true, data: article });
});

// ---- Public ----

export const listPublishedArticlesHandler = asyncHandler(async (req: Request, res: Response) => {
  const locale = typeof req.query.locale === "string" ? req.query.locale : undefined;
  const articles = await articlesService.listPublishedArticles(locale);
  res.status(200).json({ success: true, data: articles });
});

export const getPublishedArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  const article = await articlesService.getPublishedArticleBySlug(String(req.params.slug));
  res.status(200).json({ success: true, data: article });
});
