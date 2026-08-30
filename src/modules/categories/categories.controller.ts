import type { Request, Response } from "express";
import type { QueryError } from "mysql2";
import { ApiError } from "../../utils/apiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { slugify } from "../../utils/slugify.js";
import * as categoriesRepository from "./categories.repository.js";

const isDuplicateEntryError = (error: unknown): error is QueryError =>
  typeof error === "object" && error !== null && (error as QueryError).code === "ER_DUP_ENTRY";

function toResponse(row: categoriesRepository.CategoryWithArticleCount) {
  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    slug: row.slug,
    archived: row.archived,
    articleCount: row.article_count,
  };
}

function readNamesFromBody(body: unknown): { nameAr: string; nameEn: string } {
  const { nameAr, nameEn } = (body ?? {}) as Record<string, unknown>;
  if (typeof nameAr !== "string" || !nameAr.trim() || typeof nameEn !== "string" || !nameEn.trim()) {
    throw new ApiError(422, "VALIDATION_ERROR", "nameAr and nameEn are required");
  }
  return { nameAr: nameAr.trim(), nameEn: nameEn.trim() };
}

export const listCategoriesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await categoriesRepository.listCategories();
  res.status(200).json({ success: true, data: rows.map(toResponse) });
});

export const createCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const { nameAr, nameEn } = readNamesFromBody(req.body);
  const slug = slugify(nameEn);

  try {
    const id = await categoriesRepository.createCategory({ nameAr, nameEn, slug });
    res.status(201).json({ success: true, data: { id, nameAr, nameEn, slug, archived: false, articleCount: 0 } });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new ApiError(409, "SLUG_ALREADY_EXISTS", "A category with this name already exists");
    }
    throw error;
  }
});

export const updateCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid category id");

  const existing = await categoriesRepository.findCategoryById(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Category not found");

  const { nameAr, nameEn } = readNamesFromBody(req.body);
  const slug = slugify(nameEn);

  try {
    await categoriesRepository.updateCategory(id, { nameAr, nameEn, slug });
    res.status(200).json({ success: true, data: { id } });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new ApiError(409, "SLUG_ALREADY_EXISTS", "A category with this name already exists");
    }
    throw error;
  }
});

export const setCategoryArchivedHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid category id");

  const { archived } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof archived !== "boolean") throw new ApiError(422, "VALIDATION_ERROR", "archived must be a boolean");

  const existing = await categoriesRepository.findCategoryById(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Category not found");

  await categoriesRepository.setCategoryArchived(id, archived);
  res.status(200).json({ success: true, data: { id, archived } });
});
