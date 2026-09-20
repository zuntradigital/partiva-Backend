import type { QueryError } from "mysql2";
import { ApiError } from "../../utils/apiError.js";
import { validateArticleBlocks, isSafeImageSrc } from "../../utils/articleBlocks.js";
import { findCategoryById } from "../categories/categories.repository.js";
import * as articlesRepository from "./articles.repository.js";
import type { ArticleListItem, ArticleWithDetails, PublicArticleListRow, PublicArticleRow, TranslationInput } from "./articles.repository.js";
import type { ArticleTranslationRow, ContentStatus, Locale } from "../../types/db.types.js";
import { isValidTransition, isWorkflowAction, nextStatusFor, permissionRequiredFor, type WorkflowAction } from "./articles.workflow.js";
import { hasPermission } from "../../middleware/permissions.js";
import { findMediaById } from "../media/media.routes.js";

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

interface ResolvedCover {
  coverSrc: string | null;
  coverMediaId: number | null;
  coverAlt: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
}

/**
 * `cover.mediaId` (set by the Dashboard's Media Library picker/upload flow --
 * see MediaPickerModal/ArticleCoverField) always wins and is resolved
 * server-side against the real media row: src/width/height stored are that
 * row's own values, never whatever the client happened to send alongside
 * the id, so a client can't make an article claim a cover image it didn't
 * actually get from the Library. Falls back to the pre-existing plain
 * cover.src shape (validated exactly as before via isSafeImageSrc) when no
 * mediaId is given -- this is what keeps every already-published article,
 * and any caller that predates the Media Library integration, working
 * unchanged.
 */
async function resolveCover(cover: Record<string, unknown> | null, locale: Locale): Promise<ResolvedCover> {
  if (!cover) return { coverSrc: null, coverMediaId: null, coverAlt: null, coverWidth: null, coverHeight: null };

  const mediaIdRaw = cover.mediaId;
  if (mediaIdRaw === undefined || mediaIdRaw === null) {
    return {
      coverSrc: readOptionalCoverSrc(cover.src),
      coverMediaId: null,
      coverAlt: readOptionalString(cover.alt, 300),
      coverWidth: readOptionalNumber(cover.width),
      coverHeight: readOptionalNumber(cover.height),
    };
  }

  const mediaId = Number(mediaIdRaw);
  if (!Number.isInteger(mediaId) || mediaId <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid cover media reference");
  let media: Awaited<ReturnType<typeof findMediaById>>;
  try {
    media = await findMediaById(mediaId);
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "The selected media asset does not exist");
  }

  const altOverride = readOptionalString(cover.alt, 300);
  const mediaAlt = locale === "ar" ? media.alt_ar : media.alt_en;
  return {
    coverSrc: media.storage_path,
    coverMediaId: media.id,
    coverAlt: altOverride ?? (mediaAlt || null),
    coverWidth: media.width,
    coverHeight: media.height,
  };
}

async function buildTranslationInput(raw: unknown, locale: Locale): Promise<TranslationInput> {
  if (typeof raw !== "object" || raw === null) throw new ApiError(422, "VALIDATION_ERROR", `translations.${locale} is invalid`);
  const t = raw as Record<string, unknown>;

  const cover = (t.cover ?? null) as Record<string, unknown> | null;
  const seo = (t.seo ?? null) as Record<string, unknown> | null;
  const robots = seo?.robots;
  const resolvedCover = await resolveCover(cover, locale);

  return {
    title: readString(t.title, "title", 300),
    slug: readString(t.slug, "slug", 200).toLowerCase(),
    excerpt: readString(t.excerpt, "excerpt", 2000),
    content: validateArticleBlocks(t.content),
    ...resolvedCover,
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

async function readTranslations(body: Record<string, unknown>): Promise<Partial<Record<Locale, TranslationInput>>> {
  const raw = body.translations;
  if (typeof raw !== "object" || raw === null) throw new ApiError(422, "VALIDATION_ERROR", "translations is required");

  const result: Partial<Record<Locale, TranslationInput>> = {};
  for (const locale of ["ar", "en"] as const) {
    const value = (raw as Record<string, unknown>)[locale];
    if (value === undefined || value === null) continue;
    result[locale] = await buildTranslationInput(value, locale);
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

  const translations = await readTranslations(body);
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

  const translations = body.translations !== undefined ? await readTranslations(body) : {};
  const authorName = body.authorName !== undefined ? readOptionalString(body.authorName, 150) : undefined;
  const tagIds = body.tagIds !== undefined ? readTagIds(body.tagIds) : undefined;

  try {
    await articlesRepository.updateArticle(id, { categoryId, authorName, tagIds, translations });
  } catch (error) {
    if (isDuplicateEntryError(error)) throw new ApiError(409, "SLUG_ALREADY_EXISTS", "An article with this slug already exists");
    throw error;
  }

  let updated = await articlesRepository.findArticleByIdAdmin(id);

  // Media Library workflow: an article archived automatically because its image was deleted comes back to
  // the status it had as soon as every language it has carries an image again (i.e. a new image was added).
  if (updated && updated.status === "archived" && updated.image_archived_from) {
    const translations = Object.values(updated.translations);
    if (translations.length > 0 && translations.every((t) => !!t?.cover_src)) {
      if (await articlesRepository.restoreArticleFromImageArchive(id)) {
        updated = await articlesRepository.findArticleByIdAdmin(id);
      }
    }
  }
  return mapToAdminResponse(updated!);
};

export const deleteArticle = async (id: number): Promise<void> => {
  const deleted = await articlesRepository.deleteArticle(id);
  if (!deleted) throw new ApiError(404, "NOT_FOUND", "Article not found");
};

export const listArticles = async () => {
  const rows = await articlesRepository.listArticlesAdmin();
  return rows.map(mapToAdminListResponse);
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

  // An explicit workflow action supersedes the automatic image archive (see restoreArticleFromImageArchive).
  if (article.image_archived_from) await articlesRepository.clearImageArchiveMarker(id);

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
      ? { src: t.cover_src, alt: t.cover_alt ?? "", width: t.cover_width ?? 0, height: t.cover_height ?? 0, mediaId: t.cover_media_id }
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

/** Same response shape as mapToAdminResponse/mapTranslation above, for the
 * Blog list table only (see listArticlesAdmin in the repository) -- content
 * and cover are placeholders since the list never reads them; opening an
 * article (findArticleByIdAdmin -> mapToAdminResponse) still returns the
 * genuine, complete values untouched. */
function mapToAdminListResponse(item: ArticleListItem) {
  const a = item.article;
  const translations: Record<Locale, ReturnType<typeof mapListTranslation> | null> = { ar: null, en: null };
  const translationStatus: Record<Locale, string> = { ar: "not_started", en: "not_started" };

  for (const locale of ["ar", "en"] as const) {
    const t = item.translations[locale];
    if (t) {
      translations[locale] = mapListTranslation(t);
      translationStatus[locale] = t.translation_status;
    }
  }

  return {
    id: a.id,
    status: a.status,
    categoryId: a.category_id,
    categoryNameAr: a.category_name_ar,
    categoryNameEn: a.category_name_en,
    authorName: a.author_name,
    tagIds: item.tag_ids,
    publishedAt: a.published_at,
    scheduledFor: a.scheduled_for,
    rejectionComment: a.rejection_comment,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    translations,
    translationStatus,
  };
}

function mapListTranslation(t: { title: string; slug: string; excerpt: string }) {
  return {
    title: t.title,
    slug: t.slug,
    excerpt: t.excerpt,
    content: [] as unknown[],
    cover: null,
    readingTimeMinutes: null,
    seo: { title: "", description: "", canonical: "", ogTitle: "", ogDescription: "", robots: "index, follow" as const },
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

/** Same shape as mapToPublicResponse, minus `content` (see PublicArticleListRow
 * -- the Website's listing page never reads the article body, only the
 * single-article detail fetch below does). */
function mapToPublicListResponse(row: PublicArticleListRow) {
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
    content: [] as unknown[],
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
  return rows.map(mapToPublicListResponse);
};

export const getPublishedArticleBySlug = async (slug: string) => {
  const row = await articlesRepository.findPublishedBySlug(slug);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Article not found");
  return mapToPublicResponse(row);
};

export type { ContentStatus };
