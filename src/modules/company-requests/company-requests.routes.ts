import { Router } from "express";
import type { QueryError, ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { verifyRecaptcha } from "../../utils/verifyRecaptcha.js";

type BusinessActivity = "retail" | "wholesale" | "importer" | "workshop";
type CompanyRequestStatus = "new" | "contacted" | "closed";

type CompanyRequestRow = RowDataPacket & {
  id: number;
  trade_name: string;
  cr_number: string;
  business_activity: BusinessActivity;
  contact_name: string;
  city: string | null;
  contact_email: string;
  contact_phone: string;
  status: CompanyRequestStatus;
  admin_note: string | null;
  created_at: Date;
  updated_at: Date;
};

const map = (r: CompanyRequestRow) => ({
  id: r.id,
  tradeName: r.trade_name,
  crNumber: r.cr_number,
  businessActivity: r.business_activity,
  contactName: r.contact_name,
  city: r.city,
  contactEmail: r.contact_email,
  contactPhone: r.contact_phone,
  status: r.status,
  adminNote: r.admin_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const isDuplicateEntryError = (error: unknown): error is QueryError =>
  typeof error === "object" && error !== null && (error as QueryError).code === "ER_DUP_ENTRY";

const BUSINESS_ACTIVITIES: BusinessActivity[] = ["retail", "wholesale", "importer", "workshop"];
const STATUSES: CompanyRequestStatus[] = ["new", "contacted", "closed"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors the website's own CR_NUMBER_PATTERN (RegisterContent.tsx) -- a
// 10-digit placeholder pending Product/Legal confirmation (same WEB-DEC-07
// note as the frontend).
const CR_NUMBER_RE = /^\d{10}$/;
// Matches the website's own COMPANY_PHONE_PATTERN exactly (formValidation.ts):
// exactly 11 digits, digits only, no country/format assumptions.
const PHONE_RE = /^\d{11}$/;

function str(v: unknown, field: string, maxLen: number, needed = true): string {
  if (v === undefined || v === null || v === "") {
    if (needed) throw new ApiError(422, "VALIDATION_ERROR", `${field} is required`);
    return "";
  }
  if (typeof v !== "string" || v.length > maxLen) throw new ApiError(422, "VALIDATION_ERROR", `Invalid ${field}`);
  return v.trim();
}

function readCompanyRequestBody(body: Record<string, unknown>) {
  const tradeName = str(body.tradeName, "tradeName", 150);
  const crNumber = str(body.crNumber, "crNumber", 20);
  if (!CR_NUMBER_RE.test(crNumber)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid crNumber");
  const businessActivity = str(body.businessActivity, "businessActivity", 20);
  if (!BUSINESS_ACTIVITIES.includes(businessActivity as BusinessActivity)) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid businessActivity");
  }
  const contactName = str(body.contactName, "contactName", 100);
  const city = str(body.city, "city", 100, false) || null;
  const contactEmail = str(body.contactEmail, "contactEmail", 254);
  if (!EMAIL_RE.test(contactEmail)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid contactEmail");
  const contactPhone = str(body.contactPhone, "contactPhone", 20);
  if (!PHONE_RE.test(contactPhone)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid contactPhone");
  if (body.consent !== true) throw new ApiError(422, "VALIDATION_ERROR", "consent is required");

  return { tradeName, crNumber, businessActivity: businessActivity as BusinessActivity, contactName, city, contactEmail, contactPhone };
}

const getById = async (id: number): Promise<CompanyRequestRow> => {
  const [rows] = await pool.query<CompanyRequestRow[]>("SELECT * FROM company_requests WHERE id = ?", [id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Company request not found");
  return rows[0];
};

const parseId = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(422, "VALIDATION_ERROR", "Invalid id");
  return id;
};

// ---- Public (website) ----
// Mirrors [pricing-website.md-era Master: API-0002 "POST /tenants"], renamed
// away from "/tenants" -- that word is the separate Core Platform's own
// domain concept (a real merchant account with auth/RLS/orders), unrelated
// to this system. This is a pre-approval application only.
export const publicCompanyRequestsRouter = Router();
publicCompanyRequestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    // "Are you a robot?" verification (Directive: every public lead-capture
    // form) -- checked server-side against Google's own siteverify API
    // before any validation or write happens. See contact-messages.routes.ts
    // for the identical guard on that other public form.
    const recaptchaOk = await verifyRecaptcha((req.body ?? {}).recaptchaToken, req.ip);
    if (!recaptchaOk) throw new ApiError(422, "RECAPTCHA_FAILED", "Please complete the verification and try again.");

    const input = readCompanyRequestBody(req.body ?? {});

    try {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO company_requests
           (trade_name, cr_number, business_activity, contact_name, city, contact_email, contact_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [input.tradeName, input.crNumber, input.businessActivity, input.contactName, input.city, input.contactEmail, input.contactPhone]
      );
      res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        // Matches RegisterContent.tsx's existing `data?.field === "crNumber"`
        // handling -- that UI was already built expecting exactly this shape.
        res.status(409).json({
          success: false,
          error_code: "DUPLICATE_CR_NUMBER",
          message: "This commercial registration number is already registered",
          field: "crNumber",
        });
        return;
      }
      throw error;
    }
  })
);

// ---- Admin (dashboard) — "Potential Clients" ----
export const adminCompanyRequestsRouter = Router();
adminCompanyRequestsRouter.use(requireAuth);

adminCompanyRequestsRouter.get(
  "/",
  requirePermission("company_requests", "view"),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<CompanyRequestRow[]>("SELECT * FROM company_requests ORDER BY created_at DESC");
    res.json({ success: true, data: rows.map(map) });
  })
);

adminCompanyRequestsRouter.get(
  "/:id",
  requirePermission("company_requests", "view"),
  asyncHandler(async (req, res) => {
    const row = await getById(parseId(String(req.params.id)));
    res.json({ success: true, data: map(row) });
  })
);

adminCompanyRequestsRouter.patch(
  "/:id/status",
  requirePermission("company_requests", "edit"),
  asyncHandler(async (req, res) => {
    const id = parseId(String(req.params.id));
    await getById(id);
    const body = req.body ?? {};
    const status = str(body.status, "status", 20);
    if (!STATUSES.includes(status as CompanyRequestStatus)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid status");
    const adminNote = str(body.adminNote, "adminNote", 1000, false) || null;

    await pool.query("UPDATE company_requests SET status = ?, admin_note = ? WHERE id = ?", [status, adminNote, id]);
    const updated = await getById(id);
    res.json({ success: true, data: map(updated) });
  })
);
