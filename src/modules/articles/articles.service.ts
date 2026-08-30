import type { QueryError } from "mysql2";
import { ApiError } from "../../utils/apiError.js";
import { validateArticleBlocks, isSafeImageSrc } from "../../utils/articleBlocks.js";
import { findCategoryById } from "../categories/categories.repository.js";
import * as articlesRepository from "./articles.repository.js";
import type { ArticleWithDetails, PublicArticleRow, TranslationInput } from "./articles.repository.js";
import type { ArticleTranslationRow, ContentStatus, Locale } from "../../types/db.types.js";
import { isValidTransition, isWorkflowAction, nextStatusFor, permissionRequiredFor, type WorkflowAction } from "./articles.workflow.js";
import { hasPermission } from "../../middleware/permissions.js";

const isDuplicateEntryError = (error: unknown): error is QueryError =>
  typeof error === "object" && error !== null && (error as QueryError).code === "ER_DUP_ENTRY";

function readString(value: unknown, field: string, maxLen = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLen) {
    throw new ApiError(422, "VALIDATION_ERROR", `${field} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown, maxLen = 2000): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > maxLen) throw new ApiError(422, "VALIDATION_ERROR", "Invalid text field");
  return value;
}

function readOptionalCoverSrc(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isSafeImageSrc(value)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid cover image");
  return value;
}

function readOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid numeric field");
  return value;
}

function buildTranslationInput(raw: unknown, locale: Locale): TranslationInput {
  if (typeof raw !== "object" || raw === null) throw new ApiError(422, "VALIDATION_ERROR", `translations.${locale} is invalid`);
  const t = raw as Record<string, unknown>;

  const cover = (t.cover ?? null) as Record<string, unknown> | null;
  const seo = (t.seo ?? null) as Record<string, unknown> | null;
  const robots = seo?.robots;

  return {
    title: readString(t.title, "title", 300),
    slug: readString(t.slug, "slug", 200).toLowerCase(),
    excerpt: readString(t.excerpt, "excerpt", 2000),
    content: validateArticleBlocks(t.content),
    coverSrc: cover ? readOptionalCoverSrc(cover.src) : null,
    coverAlt: cover ? readOptionalString(cover.alt, 300) : null,
    coverWidth: cover ? readOptionalNumber(cover.width) : null,
    coverHeight: cover ? readOptionalNumber(cover.height) : null,
    readingTimeMinutes: readOptionalNumber(t.readingTimeMinutes),
    seoTitle: seo ? readOptionalString(seo.title, 200) : null,
    seoDescription: seo ? readOptionalString(seo.description, 300) : null,
    seoCanonical: seo ? readOptionalString(seo.canonical, 300) : null,
    seoOgTitle: seo ? readOptionalString(seo.ogTitle, 200) : null,
    seoOgDescription: seo ? readOptionalString(seo.ogDescription, 300) : null,
    seoRobots: robots === "noindex" ? "noindex" : "index_follow",
    translationStatus: t.translationStatus === "complete" || t.translationStatus === "not_started" ? t.translationStatus : "in_progress",
  };
}

function readTranslations(body: Record<string, unknown>): Partial<Record<Locale, TranslationInput>> {
  const raw = body.translations;
  if (typeof raw !== "object" || raw === null) throw new ApiError(422, "VALIDATION_ERROR", "translations is required");

  const result: Partial<Record<Locale, TranslationInput>> = {};
  for (const locale of ["ar", "en"] as const) {
    const value = (raw as Record<string, unknown>)[locale];
    if (value === undefined || value === null) continue;
    result[locale] = buildTranslationInput(value, locale);
  }
  return result;
}

async function assertCategoryExists(categoryId: number): Promise<void> {
  const category = await findCategoryById(categoryId);
  if (!category) throw new ApiError(422, "VALIDATION_ERROR", "The selected category does not exist");
}

export interface CreateArticleBody {
  categoryId: unknown;
  authorName?: unknown;
  tagIds?: unknown;
  translations: unknown;
}

function readTagIds(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ApiError(422, "VALIDATION_ERROR", "tagIds must be an array");
  return value.map((id) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid tag id");
    return n;
  });
}

export const createArticle = async (body: Record<string, unknown>, createdBy: number) => {
  const categoryId = Number(body.categoryId);
  if (!Number.isInteger(categoryId) || categoryId <= 0) throw new ApiError(422, "VALIDATION_ERROR", "categoryId is required");
  await assertCategoryExists(categoryId);

  const translations = readTranslations(body);
  if (Object.keys(translations).length === 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "At least one language's content is required");
  }

  const authorName = body.authorName !== undefined ? readOptionalString(body.authorName, 150) : null;
  const tagIds = readTagIds(body.tagIds);

  try {
    const id = await articlesRepository.createArticle({ categoryId, authorName, createdBy, tagIds, translations });
    const created = await articlesRepository.findArticleByIdAdmin(id);
    return mapToAdminResponse(created!);
  } catch (error) {
    if (isDuplicateEntryError(error)) throw new ApiError(409, "SLUG_ALREADY_EXISTS", "An article with this slug already exists");
    throw error;
  }
};

export const updateArticle = async (id: number, userId: number, roles: string[], body: Record<string, unknown>) => {
  const existing = await articlesRepository.findArticleByIdAdmin(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Article not found");

  // A role that can only submit_review (Author) may edit its own drafts, but
  // not once the article has moved past draft (submitted for review or
  // further) -- only a reviewer (Editor/Super Admin, who can "approve") may
  // still edit it at that point. Enforced here, not just hidden in the UI.
  if (existing.status !== "draft" && !hasPermission(userId, roles, "articles", "approve")) {
    throw new ApiError(403, "FORBIDDEN", "This article is no longer a draft and can only be edited by a reviewer");
  }

  const categoryId = body.categoryId !== undefined ? Number(body.categoryId) : undefined;
  if (categoryId !== undefined) {
    if (!Number.isInteger(categoryId) || categoryId <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid categoryId");
    await assertCategoryExists(categoryId);
  }

  const translations = body.translations !== undefined ? readTranslations(body) : {};
  const authorName = body.authorName !== undefined ? readOptionalString(body.authorName, 150) : undefined;
  const tagIds = body.tagIds !== undefined ? readTagIds(body.tagIds) : undefined;

  try {
    await articlesRepository.updateArticle(id, { categoryId, authorName, tagIds, translations });
  } catch (error) {
    if (isDuplicateEntryError(error)) throw new ApiError(409, "SLUG_ALREADY_EXISTS", "An article with this slug already exists");
    throw error;
  }

  const updated = await articlesRepository.findArticleByIdAdmin(id);
  return mapToAdminResponse(updated!);
};

export const deleteArticle = async (id: number): Promise<void> => {
  const deleted = await articlesRepository.deleteArticle(id);
  if (!deleted) throw new ApiError(404, "NOT_FOUND", "Article not found");
};

export const listArticles = async () => {
  const rows = await articlesRepository.listArticlesAdmin();
  return rows.map(mapToAdminResponse);
};

export const getArticle = async (id: number) => {
  const row = await articlesRepository.findArticleByIdAdmin(id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Article not found");
  return mapToAdminResponse(row);
};

/** Publishing must not be reachable with incomplete content, no matter how
 * the request is sent -- this is the authoritative check, the dashboard's
 * pre-flight check is only a UX convenience in front of this. */
function assertPublishReady(article: ArticleWithDetails): void {
  const missing: string[] = [];

  for (const locale of ["ar", "en"] as const) {
    const label = locale === "ar" ? "Arabic" : "English";
    const t = article.translations[locale];
    if (!t) {
      missing.push(`${label} content`);
      continue;
    }
    if (!Array.isArray(t.content) || t.content.length === 0) missing.push(`${label} content`);
    if (!t.cover_src) missing.push(`${label} featured image`);
    if (!t.seo_title?.trim() || !t.seo_description?.trim()) missing.push(`${label} SEO data (title and description)`);
  }

  if (missing.length > 0) {
    throw new ApiError(422, "VALIDATION_ERROR", `Cannot publish -- missing: ${missing.join(", ")}`);
  }
}

export const transitionArticleStatus = async (id: number, userId: number, roles: string[], body: Record<string, unknown>) => {
  if (!isWorkflowAction(body.action)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid workflow action");
  const action: WorkflowAction = body.action;

  const article = await articlesRepository.findArticleByIdAdmin(id);
  if (!article) throw new ApiError(404, "NOT_FOUND", "Article not found");

  if (!hasPermission(userId, roles, "articles", permissionRequiredFor(action))) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action");
  }
  if (!isValidTransition(article.status, action)) {
    throw new ApiError(409, "INVALID_TRANSITION", `Cannot ${action} an article in status "${article.status}"`);
  }

  if (action === "reject") {
    const comment = readOptionalString(body.comment, 1000);
    if (!comment) throw new ApiError(422, "VALIDATION_ERROR", "A comment is required to reject an article");
    await articlesRepository.setArticleStatus(id, nextStatusFor(action), { rejectionComment: comment });
  } else if (action === "schedule") {
    const scheduledFor = typeof body.scheduledFor === "string" ? new Date(body.scheduledFor) : null;
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
      throw new ApiError(422, "VALIDATION_ERROR", "A valid scheduledFor datetime is required");
    }
    await articlesRepository.setArticleStatus(id, nextStatusFor(action), { scheduledFor });
  } else if (action === "publish") {
    assertPublishReady(article);
    await articlesRepository.setArticleStatus(id, nextStatusFor(action), { publishedAt: new Date() });
  } else {
    await articlesRepository.setArticleStatus(id, nextStatusFor(action));
  }

  const updated = await articlesRepository.findArticleByIdAdmin(id);
  return mapToAdminResponse(updated!);
};

function mapToAdminResponse(row: ArticleWithDetails) {
  const translations: Record<Locale, ReturnType<typeof mapTranslation> | null> = { ar: null, en: null };
  const translationStatus: Record<Locale, string> = { ar: "not_started", en: "not_started" };

  for (const locale of ["ar", "en"] as const) {
    const t = row.translations[locale];
    if (t) {
      translations[locale] = mapTranslation(t);
      translationStatus[locale] = t.translation_status;
    }
  }

  return {
    id: row.id,
    status: row.status,
    categoryId: row.category_id,
    categoryNameAr: row.category_name_ar,
    categoryNameEn: row.category_name_en,
    authorName: row.author_name,
    tagIds: row.tag_ids,
    publishedAt: row.published_at,
    scheduledFor: row.scheduled_for,
    rejectionComment: row.rejection_comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    translations,
    translationStatus,
  };
}

function mapTranslation(t: ArticleTranslationRow) {
  return {
    title: t.title,
    slug: t.slug,
    excerpt: t.excerpt,
    content: t.content,
    cover: t.cover_src
      ? { src: t.cover_src, alt: t.cover_alt ?? "", width: t.cover_width ?? 0, height: t.cover_height ?? 0 }
      : null,
    readingTimeMinutes: t.reading_time_minutes,
    seo: {
      title: t.seo_title ?? "",
      description: t.seo_description ?? "",
      canonical: t.seo_canonical ?? "",
      ogTitle: t.seo_og_title ?? "",
      ogDescription: t.seo_og_description ?? "",
      robots: t.seo_robots === "noindex" ? "noindex" : "index, follow",
    },
  };
}

// ---- Public (website) ----

function mapToPublicResponse(row: PublicArticleRow) {
  return {
    language: row.language,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    readMinutes: row.read_minutes ?? 0,
    publishedAt: row.published_at,
    cover: {
      src: row.cover_src ?? "",
      alt: row.cover_alt ?? "",
      width: row.cover_width ?? 1200,
      height: row.cover_height ?? 800,
    },
    content: row.content,
    seo: {
      title: row.seo_title || row.title,
      description: row.seo_description || row.excerpt,
      canonical: row.seo_canonical || "",
      ogTitle: row.seo_og_title || row.seo_title || row.title,
      ogDescription: row.seo_og_description || row.seo_description || row.excerpt,
      robots: row.seo_robots === "noindex" ? "noindex" : "index, follow",
    },
  };
}

export const listPublishedArticles = async (locale?: string) => {
  const rows = await articlesRepository.listPublishedArticles(locale === "ar" || locale === "en" ? locale : undefined);
  return rows.map(mapToPublicResponse);
};

export const getPublishedArticleBySlug = async (slug: string) => {
  const row = await articlesRepository.findPublishedBySlug(slug);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Article not found");
  return mapToPublicResponse(row);
};

export type { ContentStatus };
