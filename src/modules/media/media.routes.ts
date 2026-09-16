import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { imageSize } from "image-size";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { MEDIA_UPLOADS_DIR, MEDIA_UPLOADS_URL_PREFIX } from "../../config/storage.js";

type MediaRow = RowDataPacket & {
  id: number; filename: string; storage_path: string; mime_type: string; size_kb: number;
  width: number | null; height: number | null; alt_ar: string; alt_en: string;
  uploaded_by: string | null; created_at: Date; updated_at: Date;
};
type UsageRow = RowDataPacket & { id: number; media_id: number; route: string | null; section: string; title_ar: string | null; title_en: string | null };
// An article's cover image references a media row directly (article_translations.cover_media_id,
// see migration 036) rather than through media_usage, which exists only for Pages placements --
// this is a second, differently-shaped "where is this used" source, merged into the same `usedIn`
// list the Dashboard already renders (see mapMedia below).
type ArticleUsageRow = RowDataPacket & { cover_media_id: number; article_id: number; locale: "ar" | "en"; title: string; status: string };

const mapMedia = (m: MediaRow, usage: UsageRow[], articleUsage: ArticleUsageRow[]) => ({
  id: m.id,
  filename: m.filename,
  url: m.storage_path,
  mimeType: m.mime_type,
  sizeKb: m.size_kb,
  width: m.width,
  height: m.height,
  altAr: m.alt_ar,
  altEn: m.alt_en,
  uploadedBy: m.uploaded_by,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
  usedIn: [
    ...usage
      .filter((u) => u.media_id === m.id)
      .map((u) => ({ id: u.id, kind: "page" as const, route: u.route, routeTitleAr: u.title_ar, routeTitleEn: u.title_en, section: u.section })),
    ...articleUsage
      .filter((u) => u.cover_media_id === m.id)
      .map((u) => ({
        id: null,
        kind: "article" as const,
        route: null,
        routeTitleAr: null,
        routeTitleEn: null,
        section: "cover",
        articleId: u.article_id,
        locale: u.locale,
        articleTitle: u.title,
        articleStatus: u.status,
      })),
  ],
});

const USAGE_JOIN = `SELECT mu.id, mu.media_id, mu.route, mu.section, p.title_ar, p.title_en
  FROM media_usage mu LEFT JOIN pages p ON p.slug = mu.route`;

// Every article_translations row that currently has a cover_media_id set --
// joined against `articles` only for status (useful context in the "in use"
// message below), not for filtering. Selected once and grouped client-side
// by cover_media_id (mapMedia's `usedIn` filter), the same shape as
// USAGE_JOIN above, so a single query covers every media row in a list response.
const ARTICLE_USAGE_SELECT = `SELECT at.cover_media_id, at.article_id, at.locale, at.title, a.status
  FROM article_translations at INNER JOIN articles a ON a.id = at.article_id
  WHERE at.cover_media_id IS NOT NULL`;

const getArticleUsageFor = async (mediaId: number): Promise<ArticleUsageRow[]> => {
  const [rows] = await pool.query<ArticleUsageRow[]>(`${ARTICLE_USAGE_SELECT} AND at.cover_media_id = ?`, [mediaId]);
  return rows;
};

const getMediaById = async (id: number): Promise<MediaRow> => {
  const [rows] = await pool.query<MediaRow[]>("SELECT * FROM media WHERE id = ?", [id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Media not found");
  return rows[0];
};

/** Reused by the Articles module (see articles.service.ts) to resolve a
 * `cover.mediaId` reference to the real file/dimensions it should store --
 * the one existing lookup, not a second copy of it. */
export const findMediaById = getMediaById;

const str = (v: unknown, needed: boolean, max = 255): string => {
  if (v === undefined || v === null || v === "") {
    if (needed) throw new ApiError(422, "VALIDATION_ERROR", "Required field missing");
    return "";
  }
  if (typeof v !== "string" || v.length > max) throw new ApiError(422, "VALIDATION_ERROR", "Invalid text field");
  return v;
};

const DATA_URL_RE = /^data:([\w./+-]+);base64,([A-Za-z0-9+/=]+)$/;
// svg+xml intentionally excluded -- can carry embedded scripts (XSS), same
// reasoning already applied to article/testimonial image uploads.
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_SIZE_KB = 5 * 1024;

function parseDataUrl(dataUrl: string): { mimeType: string; sizeKb: number } {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw new ApiError(422, "VALIDATION_ERROR", "Expected a base64 image data URL");
  const [, mimeType, base64] = match;
  if (!ALLOWED_MIME.includes(mimeType)) throw new ApiError(422, "VALIDATION_ERROR", `Unsupported image type "${mimeType}"`);
  const sizeKb = Math.round((base64.length * 3) / 4 / 1024);
  if (sizeKb > MAX_SIZE_KB) throw new ApiError(422, "VALIDATION_ERROR", "File exceeds the 5MB size limit");
  return { mimeType, sizeKb };
}

// A single media row can be referenced by both a media_usage placement and
// one or more article covers at once -- fetched together (one query each,
// regardless of list size) and merged by mapMedia() so every response
// always reflects the complete, current "where is this used" picture.
const mapOneWithUsage = async (media: MediaRow): Promise<ReturnType<typeof mapMedia>> => {
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  const articleUsage = await getArticleUsageFor(media.id);
  return mapMedia(media, usage, articleUsage);
};

// ---- Public (website) ----
export const publicMediaRouter = Router();
publicMediaRouter.get("/", asyncHandler(async (_req, res) => {
  const [media] = await pool.query<MediaRow[]>("SELECT * FROM media ORDER BY id");
  const [usage] = await pool.query<UsageRow[]>(USAGE_JOIN);
  const [articleUsage] = await pool.query<ArticleUsageRow[]>(ARTICLE_USAGE_SELECT);
  res.json({ success: true, data: media.map((m) => mapMedia(m, usage, articleUsage)) });
}));

// ---- Admin (dashboard) ----
export const adminMediaRouter = Router();
adminMediaRouter.use(requireAuth);

adminMediaRouter.get("/", requirePermission("media", "view"), asyncHandler(async (_req, res) => {
  const [media] = await pool.query<MediaRow[]>("SELECT * FROM media ORDER BY id DESC");
  const [usage] = await pool.query<UsageRow[]>(USAGE_JOIN);
  const [articleUsage] = await pool.query<ArticleUsageRow[]>(ARTICLE_USAGE_SELECT);
  res.json({ success: true, data: media.map((m) => mapMedia(m, usage, articleUsage)) });
}));

adminMediaRouter.get("/:id", requirePermission("media", "view"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  res.json({ success: true, data: await mapOneWithUsage(media) });
}));

// Every new upload must declare where it's used -- the route (page slug)
// and section must both be real, existing records (Pages/Sections are not
// duplicated here, just referenced), so the resulting media_usage row is
// always valid and the item shows up in the Library with a correct place.
adminMediaRouter.post("/", requirePermission("media", "create"), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const filename = str(b.filename, true, 255);
  const dataUrl = str(b.dataUrl, true, 10_000_000);
  const { mimeType, sizeKb } = parseDataUrl(dataUrl);
  const altAr = str(b.altAr, true, 255);
  const altEn = str(b.altEn, false, 255);
  const width = Number.isInteger(b.width) ? b.width : null;
  const height = Number.isInteger(b.height) ? b.height : null;
  const route = str(b.route, true, 100);
  const section = str(b.section, true, 100);

  const [pageRows] = await pool.query<RowDataPacket[]>("SELECT id FROM pages WHERE slug = ?", [route]);
  if (!pageRows[0]) throw new ApiError(422, "VALIDATION_ERROR", "Unknown page");
  const [sectionRows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM page_sections WHERE page_id = ? AND section_key = ?",
    [pageRows[0].id, section]
  );
  if (!sectionRows[0]) throw new ApiError(422, "VALIDATION_ERROR", "Unknown section for this page");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [r] = await connection.query<ResultSetHeader>(
      "INSERT INTO media (filename, storage_path, mime_type, size_kb, width, height, alt_ar, alt_en, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)",
      [filename, dataUrl, mimeType, sizeKb, width, height, altAr, altEn, req.user?.email ?? null]
    );
    // A route+section can only ever have one active image -- without this,
    // assigning a new upload to an already-used slot left the old
    // media_usage row in place too, and since the public list is read in id
    // order and the Website takes the first match, the new upload was saved
    // successfully but silently never rendered (the older row always won).
    await connection.query("DELETE FROM media_usage WHERE route = ? AND section = ?", [route, section]);
    await connection.query("INSERT INTO media_usage (media_id, route, section) VALUES (?,?,?)", [r.insertId, route, section]);
    await connection.commit();
    const media = await getMediaById(r.insertId);
    res.status(201).json({ success: true, data: await mapOneWithUsage(media) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// ---- Real file upload (Article covers / general Library use) ----
//
// Distinct from POST "/" above: that endpoint is the Pages module's
// original flow (JSON body, base64 dataUrl, mandatory route+section
// placement). This one accepts an actual multipart file, validates and
// stores it as a real file on disk (never base64-in-MySQL), and creates NO
// media_usage row -- a raw Library upload isn't tied to any placement yet.
// It's tied to something (e.g. an article cover) afterwards, by that
// something referencing this media row's id directly (see
// article_translations.cover_media_id, migration 036) -- reusing this one
// `media` table and its existing delete-guard/list/detail endpoints rather
// than building a second upload system.
fs.mkdirSync(MEDIA_UPLOADS_DIR, { recursive: true });

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_KB * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // A first, cheap check on the client-declared MIME type -- rejected
    // early, before the file is even fully buffered, if it's obviously
    // wrong. The real, content-based check (imageSize() below, which reads
    // actual image header bytes rather than trusting this header) still
    // runs on every accepted file; a spoofed Content-Type with real
    // non-image bytes behind it is caught there, not here.
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(new ApiError(422, "VALIDATION_ERROR", `Unsupported image type "${file.mimetype}"`));
      return;
    }
    cb(null, true);
  },
});

// multer's own errors (e.g. LIMIT_FILE_SIZE) are thrown from inside its
// callback-style middleware, not a rejected Promise -- asyncHandler can't
// catch those. Normalized to the same ApiError shape as every other
// validation failure in this file instead of falling through to the
// generic 500 handler.
function handleSingleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    const code = (err as { code?: string })?.code;
    if (code === "LIMIT_FILE_SIZE") return next(new ApiError(422, "VALIDATION_ERROR", "File exceeds the 5MB size limit"));
    next(new ApiError(422, "VALIDATION_ERROR", "Invalid upload"));
  });
}

/** Never derived from the client-supplied filename (which is display-only
 * and never trusted for a filesystem path) -- a fresh random name plus an
 * extension mapped from the already-validated MIME type, so there is no
 * path-traversal or executable-extension surface at all. */
function safeStoredFilename(mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType] ?? "bin";
  return `${crypto.randomUUID()}.${ext}`;
}

adminMediaRouter.post("/upload", requirePermission("media", "create"), handleSingleUpload, asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(422, "VALIDATION_ERROR", "No file was uploaded");
  if (file.size / 1024 > MAX_SIZE_KB) throw new ApiError(422, "VALIDATION_ERROR", "File exceeds the 5MB size limit");

  // Content-based validation, independent of the client-declared MIME type
  // and file extension: imageSize() reads the actual image header bytes and
  // throws for anything that isn't a real, recognized image -- a non-image
  // file renamed to end in .jpg (or with a spoofed Content-Type) is rejected
  // here even though fileFilter's cheaper header check already passed it.
  let dimensions: { width?: number; height?: number; type?: string };
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "The uploaded file is not a valid image");
  }

  const b = req.body ?? {};
  const altAr = str(b.altAr, false, 255);
  const altEn = str(b.altEn, false, 255);
  const storedFilename = safeStoredFilename(file.mimetype);
  const absolutePath = path.join(MEDIA_UPLOADS_DIR, storedFilename);

  await fs.promises.writeFile(absolutePath, file.buffer);

  try {
    const [r] = await pool.query<ResultSetHeader>(
      "INSERT INTO media (filename, storage_path, mime_type, size_kb, width, height, alt_ar, alt_en, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        // Original filename is display-only from here on -- truncated to fit
        // the column, never used to build a path.
        str(file.originalname, false, 255) || storedFilename,
        `${MEDIA_UPLOADS_URL_PREFIX}/${storedFilename}`,
        file.mimetype,
        Math.round(file.size / 1024),
        dimensions.width ?? null,
        dimensions.height ?? null,
        altAr,
        altEn,
        req.user?.email ?? null,
      ]
    );
    const media = await getMediaById(r.insertId);
    res.status(201).json({ success: true, data: await mapOneWithUsage(media) });
  } catch (error) {
    // The DB insert is what makes this file "real" -- if it failed, don't
    // leave an unreferenced file behind on disk.
    await fs.promises.unlink(absolutePath).catch(() => {});
    throw error;
  }
}));

adminMediaRouter.put("/:id", requirePermission("media", "edit"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const b = req.body ?? {};
  const altAr = str(b.altAr, true, 255);
  const altEn = str(b.altEn, false, 255);
  await pool.query("UPDATE media SET alt_ar=?, alt_en=? WHERE id=?", [altAr, altEn, media.id]);
  const updated = await getMediaById(media.id);
  res.json({ success: true, data: await mapOneWithUsage(updated) });
}));

// Replaces the file behind an existing media record, keeping its id (and
// therefore every existing usage -- page placements AND article covers)
// intact -- matches the Dashboard's "Replace file (same id)" action instead
// of creating a new asset. Still base64-JSON (the Pages UploadModal/
// MediaDetailModal's existing replace flow, unchanged) -- the new real-file
// upload path above is additive, not a replacement of this one.
adminMediaRouter.put("/:id/replace", requirePermission("media", "edit"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const b = req.body ?? {};
  const filename = str(b.filename, true, 255);
  const dataUrl = str(b.dataUrl, true, 10_000_000);
  const { mimeType, sizeKb } = parseDataUrl(dataUrl);
  const width = Number.isInteger(b.width) ? b.width : null;
  const height = Number.isInteger(b.height) ? b.height : null;

  const previousPath = media.storage_path;
  await pool.query(
    "UPDATE media SET filename=?, storage_path=?, mime_type=?, size_kb=?, width=?, height=? WHERE id=?",
    [filename, dataUrl, mimeType, sizeKb, width, height, media.id]
  );
  // If the row being replaced pointed at a real on-disk file, it's now
  // orphaned (nothing references that path any more) -- best-effort cleanup,
  // never fails the request (the DB is already the source of truth).
  await unlinkIfOwnedUpload(previousPath);

  const updated = await getMediaById(media.id);
  res.json({ success: true, data: await mapOneWithUsage(updated) });
}));

// Unlink a single media_usage row -- the Website falls back to that
// route/section's default image (see HeroSection/CTASection/layout's
// `?? "/images/..."` fallbacks); it never breaks or shows a broken <img>.
adminMediaRouter.delete("/:id/usage/:usageId", requirePermission("media", "edit"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const usageId = Number(req.params.usageId);
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM media_usage WHERE id = ? AND media_id = ?", [usageId, media.id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Usage not found");
  await pool.query("DELETE FROM media_usage WHERE id = ?", [usageId]);
  const updated = await getMediaById(media.id);
  res.json({ success: true, data: await mapOneWithUsage(updated) });
}));

// Reassigns a route/section's usage to point at a different existing media
// item -- the Website picks up the new image on its next request, no gap.
adminMediaRouter.put("/:id/usage/:usageId", requirePermission("media", "edit"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const usageId = Number(req.params.usageId);
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM media_usage WHERE id = ? AND media_id = ?", [usageId, media.id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Usage not found");
  const newMediaId = Number((req.body ?? {}).mediaId);
  if (!Number.isInteger(newMediaId) || newMediaId <= 0) throw new ApiError(422, "VALIDATION_ERROR", "mediaId is required");
  await getMediaById(newMediaId);
  await pool.query("UPDATE media_usage SET media_id = ? WHERE id = ?", [newMediaId, usageId]);
  const updated = await getMediaById(media.id);
  res.json({ success: true, data: await mapOneWithUsage(updated) });
}));

/** Deletes the on-disk file behind a media row's storage_path, but only if
 * it's one this module actually owns (a real upload under
 * MEDIA_UPLOADS_URL_PREFIX) -- a legacy base64 value or a Website-relative
 * seeded path (e.g. "/images/logo.png") is never touched. Best-effort: a
 * failure here is logged, never thrown, since the DB row is already the
 * source of truth and a stray file is a much smaller problem than a failed
 * delete/replace request. */
async function unlinkIfOwnedUpload(storagePath: string): Promise<void> {
  if (!storagePath.startsWith(`${MEDIA_UPLOADS_URL_PREFIX}/`)) return;
  const storedFilename = storagePath.slice(MEDIA_UPLOADS_URL_PREFIX.length + 1);
  // Belt-and-suspenders against a corrupt/unexpected value ever escaping the
  // uploads directory -- storedFilename always comes from our own
  // crypto.randomUUID()-based naming, so this should never actually trigger.
  if (storedFilename.includes("/") || storedFilename.includes("..")) return;
  await fs.promises.unlink(path.join(MEDIA_UPLOADS_DIR, storedFilename)).catch((err) => {
    console.warn(`[media] Failed to remove uploaded file for deleted/replaced media: ${storedFilename}`, err);
  });
}

// Safe deletion (SRS-style requirement): an asset currently referenced by
// any Website page/section OR any article's cover cannot be deleted -- the
// Website/article would otherwise break. The caller must remove/replace
// those usages first (unlink the page placement, or change the article's
// cover image).
adminMediaRouter.delete("/:id", requirePermission("media", "delete"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  const articleUsage = await getArticleUsageFor(media.id);
  if (usage.length > 0 || articleUsage.length > 0) {
    const pagePlaces = usage.map((u) => (u.route ? `${u.title_ar ?? u.route} — ${u.section}` : `عام — ${u.section}`));
    const articlePlaces = articleUsage.map((u) => `مقال: ${u.title} (${u.locale === "ar" ? "عربي" : "إنجليزي"})`);
    const places = [...pagePlaces, ...articlePlaces].join("، ");
    throw new ApiError(409, "MEDIA_IN_USE", `لا يمكن حذف هذا الأصل لأنه مستخدم حاليًا في: ${places}. أزل أو استبدل هذه الاستخدامات أولًا.`);
  }
  await pool.query("DELETE FROM media WHERE id = ?", [media.id]);
  await unlinkIfOwnedUpload(media.storage_path);
  res.json({ success: true, data: { id: media.id } });
}));
