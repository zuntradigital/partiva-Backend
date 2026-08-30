import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";

type MediaRow = RowDataPacket & {
  id: number; filename: string; storage_path: string; mime_type: string; size_kb: number;
  width: number | null; height: number | null; alt_ar: string; alt_en: string;
  uploaded_by: string | null; created_at: Date; updated_at: Date;
};
type UsageRow = RowDataPacket & { id: number; media_id: number; route: string | null; section: string; title_ar: string | null; title_en: string | null };

const mapMedia = (m: MediaRow, usage: UsageRow[]) => ({
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
  usedIn: usage
    .filter((u) => u.media_id === m.id)
    .map((u) => ({ id: u.id, route: u.route, routeTitleAr: u.title_ar, routeTitleEn: u.title_en, section: u.section })),
});

const USAGE_JOIN = `SELECT mu.id, mu.media_id, mu.route, mu.section, p.title_ar, p.title_en
  FROM media_usage mu LEFT JOIN pages p ON p.slug = mu.route`;

const getMediaById = async (id: number): Promise<MediaRow> => {
  const [rows] = await pool.query<MediaRow[]>("SELECT * FROM media WHERE id = ?", [id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Media not found");
  return rows[0];
};

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

// ---- Public (website) ----
export const publicMediaRouter = Router();
publicMediaRouter.get("/", asyncHandler(async (_req, res) => {
  const [media] = await pool.query<MediaRow[]>("SELECT * FROM media ORDER BY id");
  const [usage] = await pool.query<UsageRow[]>(USAGE_JOIN);
  res.json({ success: true, data: media.map((m) => mapMedia(m, usage)) });
}));

// ---- Admin (dashboard) ----
export const adminMediaRouter = Router();
adminMediaRouter.use(requireAuth);

adminMediaRouter.get("/", requirePermission("media", "view"), asyncHandler(async (_req, res) => {
  const [media] = await pool.query<MediaRow[]>("SELECT * FROM media ORDER BY id DESC");
  const [usage] = await pool.query<UsageRow[]>(USAGE_JOIN);
  res.json({ success: true, data: media.map((m) => mapMedia(m, usage)) });
}));

adminMediaRouter.get("/:id", requirePermission("media", "view"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  res.json({ success: true, data: mapMedia(media, usage) });
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
    const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
    res.status(201).json({ success: true, data: mapMedia(media, usage) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminMediaRouter.put("/:id", requirePermission("media", "edit"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const b = req.body ?? {};
  const altAr = str(b.altAr, true, 255);
  const altEn = str(b.altEn, false, 255);
  await pool.query("UPDATE media SET alt_ar=?, alt_en=? WHERE id=?", [altAr, altEn, media.id]);
  const updated = await getMediaById(media.id);
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  res.json({ success: true, data: mapMedia(updated, usage) });
}));

// Replaces the file behind an existing media record, keeping its id (and
// therefore every existing usage) intact -- matches the Dashboard's
// "Replace file (same id)" action instead of creating a new asset.
adminMediaRouter.put("/:id/replace", requirePermission("media", "edit"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const b = req.body ?? {};
  const filename = str(b.filename, true, 255);
  const dataUrl = str(b.dataUrl, true, 10_000_000);
  const { mimeType, sizeKb } = parseDataUrl(dataUrl);
  const width = Number.isInteger(b.width) ? b.width : null;
  const height = Number.isInteger(b.height) ? b.height : null;

  await pool.query(
    "UPDATE media SET filename=?, storage_path=?, mime_type=?, size_kb=?, width=?, height=? WHERE id=?",
    [filename, dataUrl, mimeType, sizeKb, width, height, media.id]
  );
  const updated = await getMediaById(media.id);
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  res.json({ success: true, data: mapMedia(updated, usage) });
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
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  res.json({ success: true, data: mapMedia(updated, usage) });
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
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  res.json({ success: true, data: mapMedia(updated, usage) });
}));

// Safe deletion (SRS-style requirement): an asset currently referenced by
// any Website page/section cannot be deleted -- the Website would otherwise
// break. The caller must remove/replace those usages first.
adminMediaRouter.delete("/:id", requirePermission("media", "delete"), asyncHandler(async (req, res) => {
  const media = await getMediaById(Number(req.params.id));
  const [usage] = await pool.query<UsageRow[]>(`${USAGE_JOIN} WHERE mu.media_id = ?`, [media.id]);
  if (usage.length > 0) {
    const places = usage.map((u) => (u.route ? `${u.title_ar ?? u.route} — ${u.section}` : `عام — ${u.section}`)).join("، ");
    throw new ApiError(409, "MEDIA_IN_USE", `لا يمكن حذف هذا الأصل لأنه مستخدم حاليًا في: ${places}. أزل أو استبدل هذه الاستخدامات أولًا.`);
  }
  await pool.query("DELETE FROM media WHERE id = ?", [media.id]);
  res.json({ success: true, data: { id: media.id } });
}));
