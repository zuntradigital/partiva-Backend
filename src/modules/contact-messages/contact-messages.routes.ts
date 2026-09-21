import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { verifyRecaptcha } from "../../utils/verifyRecaptcha.js";
import { PHONE_RE } from "../../utils/phone.js";

type InquiryType = "sales" | "support" | "partnership" | "press" | "other";
type ContactMessageStatus = "new" | "read" | "replied";

type ContactMessageRow = RowDataPacket & {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  inquiry_type: InquiryType;
  message: string;
  status: ContactMessageStatus;
  created_at: Date;
  updated_at: Date;
};

const map = (r: ContactMessageRow) => ({
  id: r.id,
  fullName: r.full_name,
  email: r.email,
  phone: r.phone,
  inquiryType: r.inquiry_type,
  message: r.message,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const INQUIRY_TYPES: InquiryType[] = ["sales", "support", "partnership", "press", "other"];
const STATUSES: ContactMessageStatus[] = ["new", "read", "replied"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Phone: the shared rule in utils/phone.ts (exactly 10 digits, nothing else).
// Optional here (phone itself is not required).
const MESSAGE_MIN_LENGTH = 10;

function str(v: unknown, field: string, maxLen: number, needed = true): string {
  if (v === undefined || v === null || v === "") {
    if (needed) throw new ApiError(422, "VALIDATION_ERROR", `${field} is required`);
    return "";
  }
  if (typeof v !== "string" || v.length > maxLen) throw new ApiError(422, "VALIDATION_ERROR", `Invalid ${field}`);
  return v.trim();
}

export function readContactMessageBody(body: Record<string, unknown>) {
  const fullName = str(body.fullName, "fullName", 100);
  const email = str(body.email, "email", 254);
  if (!EMAIL_RE.test(email)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid email");
  const phone = str(body.phone, "phone", 20, false) || null;
  if (phone && !PHONE_RE.test(phone)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid phone");
  const inquiryType = str(body.inquiryType, "inquiryType", 20);
  if (!INQUIRY_TYPES.includes(inquiryType as InquiryType)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid inquiryType");
  const message = str(body.message, "message", 2000);
  if (message.length < MESSAGE_MIN_LENGTH) throw new ApiError(422, "VALIDATION_ERROR", "message is too short");

  return { fullName, email, phone, inquiryType: inquiryType as InquiryType, message };
}

const getById = async (id: number): Promise<ContactMessageRow> => {
  const [rows] = await pool.query<ContactMessageRow[]>("SELECT * FROM contact_messages WHERE id = ?", [id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Contact message not found");
  return rows[0];
};

const parseId = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(422, "VALIDATION_ERROR", "Invalid id");
  return id;
};

// ---- Public (website) ----
// Deliberately its own path, distinct from the existing GET /api/contact
// (the site-wide contact-info singleton, contact.routes.ts) -- that table
// is a hard CHECK(id=1) singleton and cannot hold a list of messages.
export const publicContactMessagesRouter = Router();
publicContactMessagesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    // "Are you a robot?" verification (Directive: every public lead-capture
    // form) -- checked server-side against Google's own siteverify API
    // before any validation or write happens. A missing/invalid/expired
    // token is rejected the same way regardless of which case it is; the
    // client-side widget (Recaptcha.tsx) is a UX convenience, not the
    // actual security boundary.
    const recaptchaOk = await verifyRecaptcha((req.body ?? {}).recaptchaToken, req.ip);
    if (!recaptchaOk) throw new ApiError(422, "RECAPTCHA_FAILED", "Please complete the verification and try again.");

    const input = readContactMessageBody(req.body ?? {});
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO contact_messages (full_name, email, phone, inquiry_type, message) VALUES (?, ?, ?, ?, ?)`,
      [input.fullName, input.email, input.phone, input.inquiryType, input.message]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  })
);

// ---- Admin (dashboard) — "Contact Requests" ----
export const adminContactMessagesRouter = Router();
adminContactMessagesRouter.use(requireAuth);

adminContactMessagesRouter.get(
  "/",
  requirePermission("contact_messages", "view"),
  asyncHandler(async (_req, res) => {
    const [rows] = await pool.query<ContactMessageRow[]>("SELECT * FROM contact_messages ORDER BY created_at DESC");
    res.json({ success: true, data: rows.map(map) });
  })
);

adminContactMessagesRouter.get(
  "/:id",
  requirePermission("contact_messages", "view"),
  asyncHandler(async (req, res) => {
    const row = await getById(parseId(String(req.params.id)));
    res.json({ success: true, data: map(row) });
  })
);

adminContactMessagesRouter.patch(
  "/:id/status",
  requirePermission("contact_messages", "edit"),
  asyncHandler(async (req, res) => {
    const id = parseId(String(req.params.id));
    await getById(id);
    const body = req.body ?? {};
    const status = str(body.status, "status", 20);
    if (!STATUSES.includes(status as ContactMessageStatus)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid status");

    await pool.query("UPDATE contact_messages SET status = ? WHERE id = ?", [status, id]);
    const updated = await getById(id);
    res.json({ success: true, data: map(updated) });
  })
);
