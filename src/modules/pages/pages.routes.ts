import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";

type PageRow = RowDataPacket & { id:number; slug:string; title_ar:string; title_en:string|null; visible:boolean; show_in_nav:boolean; display_order:number; updated_at:Date };
type SectionRow = RowDataPacket & {
  id:number; page_id:number; section_key:string; title_ar:string|null; title_en:string|null; body_ar:string|null; body_en:string|null;
  badge_ar:string|null; badge_en:string|null; cta_label_ar:string|null; cta_label_en:string|null; cta_href:string|null;
  cta2_label_ar:string|null; cta2_label_en:string|null; cta2_href:string|null;
  visible:boolean; display_order:number; updated_at:Date;
};

const mapSection = (s: SectionRow) => ({
  id: s.id, key: s.section_key, titleAr: s.title_ar, titleEn: s.title_en, bodyAr: s.body_ar, bodyEn: s.body_en,
  badgeAr: s.badge_ar, badgeEn: s.badge_en,
  ctaLabelAr: s.cta_label_ar, ctaLabelEn: s.cta_label_en, ctaHref: s.cta_href,
  cta2LabelAr: s.cta2_label_ar, cta2LabelEn: s.cta2_label_en, cta2Href: s.cta2_href,
  visible: Boolean(s.visible), displayOrder: s.display_order, updatedAt: s.updated_at,
});
const mapPage = (p: PageRow) => ({
  id: p.id, slug: p.slug, titleAr: p.title_ar, titleEn: p.title_en,
  visible: Boolean(p.visible), showInNav: Boolean(p.show_in_nav), displayOrder: p.display_order, updatedAt: p.updated_at,
});

const getPageBySlug = async (slug: string): Promise<PageRow> => {
  const [rows] = await pool.query<PageRow[]>("SELECT * FROM pages WHERE slug = ?", [slug]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Page not found");
  return rows[0];
};
const getSections = async (pageId: number): Promise<SectionRow[]> => {
  const [rows] = await pool.query<SectionRow[]>("SELECT * FROM page_sections WHERE page_id = ? ORDER BY display_order, id", [pageId]);
  return rows;
};
const getSection = async (pageId: number, id: number): Promise<SectionRow> => {
  const [rows] = await pool.query<SectionRow[]>("SELECT * FROM page_sections WHERE page_id = ? AND id = ?", [pageId, id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Section not found");
  return rows[0];
};

const str = (v: unknown, needed: boolean, max = 500): string | null => {
  if (v === undefined || v === null || v === "") { if (needed) throw new ApiError(422, "VALIDATION_ERROR", "Required field missing"); return null; }
  if (typeof v !== "string" || v.length > max) throw new ApiError(422, "VALIDATION_ERROR", "Invalid text field");
  return v;
};
const bool = (v: unknown): boolean => { if (typeof v !== "boolean") throw new ApiError(422, "VALIDATION_ERROR", "Invalid boolean field"); return v; };

// ---- Public (website) ----
export const publicPagesRouter = Router();
publicPagesRouter.get("/", asyncHandler(async (_req, res) => {
  const [pages] = await pool.query<PageRow[]>("SELECT * FROM pages WHERE visible = TRUE ORDER BY display_order, id");
  const [sections] = await pool.query<SectionRow[]>(
    `SELECT ps.* FROM page_sections ps INNER JOIN pages p ON p.id = ps.page_id WHERE p.visible = TRUE AND ps.visible = TRUE ORDER BY ps.display_order, ps.id`
  );
  const data = pages.map((p) => ({
    ...mapPage(p),
    sections: sections.filter((s) => s.page_id === p.id).map(mapSection),
  }));
  res.json({ success: true, data });
}));

// ---- Admin (dashboard) ----
export const adminPagesRouter = Router();
adminPagesRouter.use(requireAuth);

adminPagesRouter.get("/", requirePermission("pages", "view"), asyncHandler(async (_req, res) => {
  const [pages] = await pool.query<PageRow[]>("SELECT * FROM pages ORDER BY display_order, id");
  res.json({ success: true, data: pages.map(mapPage) });
}));

adminPagesRouter.get("/:slug", requirePermission("pages", "view"), asyncHandler(async (req, res) => {
  const page = await getPageBySlug(String(req.params.slug));
  const sections = await getSections(page.id);
  res.json({ success: true, data: { ...mapPage(page), sections: sections.map(mapSection) } });
}));

// Pages themselves mirror the Website's fixed route list (routes come from
// the app's folder structure, not created here) -- only their metadata
// (title/visibility/nav placement) is editable, matching the Dashboard's
// existing "cannot add pages beyond the fixed set" design.
adminPagesRouter.put("/:slug", requirePermission("pages", "edit"), asyncHandler(async (req, res) => {
  const page = await getPageBySlug(String(req.params.slug));
  const b = req.body ?? {};
  const titleAr = str(b.titleAr, true, 200)!;
  const titleEn = str(b.titleEn, false, 200);
  const visible = bool(b.visible);
  const showInNav = bool(b.showInNav);
  await pool.query("UPDATE pages SET title_ar=?, title_en=?, visible=?, show_in_nav=? WHERE id=?", [titleAr, titleEn, visible, showInNav, page.id]);
  const updated = await getPageBySlug(String(req.params.slug));
  res.json({ success: true, data: mapPage(updated) });
}));

adminPagesRouter.post("/:slug/sections", requirePermission("pages", "edit"), asyncHandler(async (req, res) => {
  const page = await getPageBySlug(String(req.params.slug));
  const b = req.body ?? {};
  const order = Number.isInteger(b.displayOrder) ? b.displayOrder : (await getSections(page.id)).length;
  const [r] = await pool.query<ResultSetHeader>(
    "INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, badge_ar, badge_en, cta_label_ar, cta_label_en, cta_href, cta2_label_ar, cta2_label_en, cta2_href, visible, display_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [page.id, str(b.key, true, 100), str(b.titleAr, false, 300), str(b.titleEn, false, 300), str(b.bodyAr, false, 20000), str(b.bodyEn, false, 20000),
     str(b.badgeAr, false, 150), str(b.badgeEn, false, 150), str(b.ctaLabelAr, false, 150), str(b.ctaLabelEn, false, 150), str(b.ctaHref, false, 300),
     str(b.cta2LabelAr, false, 150), str(b.cta2LabelEn, false, 150), str(b.cta2Href, false, 300), bool(b.visible ?? true), order]
  );
  res.status(201).json({ success: true, data: mapSection(await getSection(page.id, r.insertId)) });
}));

adminPagesRouter.put("/:slug/sections/:id", requirePermission("pages", "edit"), asyncHandler(async (req, res) => {
  const page = await getPageBySlug(String(req.params.slug));
  const id = Number(req.params.id);
  await getSection(page.id, id);
  const b = req.body ?? {};
  await pool.query(
    "UPDATE page_sections SET title_ar=?, title_en=?, body_ar=?, body_en=?, badge_ar=?, badge_en=?, cta_label_ar=?, cta_label_en=?, cta_href=?, cta2_label_ar=?, cta2_label_en=?, cta2_href=?, visible=?, display_order=? WHERE id=? AND page_id=?",
    [str(b.titleAr, false, 300), str(b.titleEn, false, 300), str(b.bodyAr, false, 20000), str(b.bodyEn, false, 20000),
     str(b.badgeAr, false, 150), str(b.badgeEn, false, 150), str(b.ctaLabelAr, false, 150), str(b.ctaLabelEn, false, 150), str(b.ctaHref, false, 300),
     str(b.cta2LabelAr, false, 150), str(b.cta2LabelEn, false, 150), str(b.cta2Href, false, 300), bool(b.visible), Number(b.displayOrder) || 0, id, page.id]
  );
  res.json({ success: true, data: mapSection(await getSection(page.id, id)) });
}));

adminPagesRouter.delete("/:slug/sections/:id", requirePermission("pages", "edit"), asyncHandler(async (req, res) => {
  const page = await getPageBySlug(String(req.params.slug));
  const id = Number(req.params.id);
  const [r] = await pool.query<ResultSetHeader>("DELETE FROM page_sections WHERE id=? AND page_id=?", [id, page.id]);
  if (!r.affectedRows) throw new ApiError(404, "NOT_FOUND", "Section not found");
  res.json({ success: true, data: { id } });
}));
