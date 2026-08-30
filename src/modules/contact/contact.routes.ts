import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";

type SocialLink = { id: string; platform: string; url: string };
type Contact = RowDataPacket & {
  whatsapp_number: string | null; whatsapp_link: string | null; website_url: string | null; email: string | null;
  address_ar: string | null; address_en: string | null; location_ar: string | null; location_en: string | null;
  social_links: SocialLink[] | null; updated_at: Date;
};

const map = (c: Contact) => ({
  whatsappNumber: c.whatsapp_number, whatsappLink: c.whatsapp_link, websiteUrl: c.website_url, email: c.email,
  addressAr: c.address_ar, addressEn: c.address_en, locationAr: c.location_ar, locationEn: c.location_en,
  social: c.social_links ?? [], updatedAt: c.updated_at,
});

const EMPTY: Contact = {
  whatsapp_number: null, whatsapp_link: null, website_url: null, email: null,
  address_ar: null, address_en: null, location_ar: null, location_en: null,
  social_links: [], updated_at: new Date(),
} as Contact;

const get = async (): Promise<Contact> => {
  const [rows] = await pool.query<Contact[]>("SELECT * FROM contact_info WHERE id = 1");
  return rows[0] ?? EMPTY;
};

const clean = (b: Record<string, unknown>) => {
  const s = (v: unknown, n: string, max = 500) => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || v.length > max) throw new ApiError(422, "VALIDATION_ERROR", `Invalid ${n}`);
    return v.trim();
  };
  if (!Array.isArray(b.social) || b.social.length > 20) throw new ApiError(422, "VALIDATION_ERROR", "Invalid social links");
  const social = b.social.map((item, i) => {
    if (typeof item !== "object" || item === null) throw new ApiError(422, "VALIDATION_ERROR", `Invalid social[${i}]`);
    const { id, platform, url } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id) throw new ApiError(422, "VALIDATION_ERROR", `Invalid social[${i}].id`);
    return { id, platform: s(platform, `social[${i}].platform`, 100) ?? "", url: s(url, `social[${i}].url`, 500) ?? "" };
  });
  return [
    s(b.whatsappNumber, "whatsappNumber", 50), s(b.whatsappLink, "whatsappLink"),
    s(b.websiteUrl, "websiteUrl"), s(b.email, "email", 255),
    s(b.addressAr, "addressAr"), s(b.addressEn, "addressEn"),
    s(b.locationAr, "locationAr", 255), s(b.locationEn, "locationEn", 255),
    JSON.stringify(social),
  ];
};

export const publicContactRouter = Router();
publicContactRouter.get("/", asyncHandler(async (_req, res) => {
  res.json({ success: true, data: map(await get()) });
}));

export const adminContactRouter = Router();
adminContactRouter.use(requireAuth);

adminContactRouter.get("/", requirePermission("contact_info", "view"), asyncHandler(async (_req, res) => {
  res.json({ success: true, data: map(await get()) });
}));

// Singleton: PUT upserts the one row, covering both "add" (first save) and
// "edit" (later saves) with a single endpoint -- matching the Dashboard's
// existing RBAC, which only grants "view"/"edit" for this resource.
adminContactRouter.put("/", requirePermission("contact_info", "edit"), asyncHandler(async (req, res) => {
  const values = clean(req.body ?? {});
  await pool.query(
    `INSERT INTO contact_info (id, whatsapp_number, whatsapp_link, website_url, email, address_ar, address_en, location_ar, location_en, social_links)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       whatsapp_number = VALUES(whatsapp_number), whatsapp_link = VALUES(whatsapp_link),
       website_url = VALUES(website_url), email = VALUES(email),
       address_ar = VALUES(address_ar), address_en = VALUES(address_en),
       location_ar = VALUES(location_ar), location_en = VALUES(location_en),
       social_links = VALUES(social_links)`,
    values
  );
  res.json({ success: true, data: map(await get()) });
}));

// Resets contact info back to blank -- there's always exactly one row, so
// "delete" clears its fields rather than removing the row itself.
adminContactRouter.delete("/", requirePermission("contact_info", "delete"), asyncHandler(async (_req, res) => {
  await pool.query(
    `INSERT INTO contact_info (id, whatsapp_number, whatsapp_link, website_url, email, address_ar, address_en, location_ar, location_en, social_links)
     VALUES (1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, JSON_ARRAY())
     ON DUPLICATE KEY UPDATE
       whatsapp_number = NULL, whatsapp_link = NULL, website_url = NULL, email = NULL,
       address_ar = NULL, address_en = NULL, location_ar = NULL, location_en = NULL, social_links = JSON_ARRAY()`
  );
  res.json({ success: true, data: map(await get()) });
}));
