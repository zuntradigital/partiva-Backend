import type { NextFunction, Request, Response } from "express";
import pool from "../config/database.js";

// Skip logging for these resource segments -- they're the audit/notification
// endpoints themselves (reads, or the "mark read" no-op), not content
// mutations worth recording.
const EXCLUDED_RESOURCE_TYPES = new Set(["audit", "notifications"]);

const LABEL_KEYS = ["nameAr", "titleAr", "questionAr", "categoryAr", "roleAr", "name", "title", "email", "whatsappNumber", "tradeName", "fullName"];

function pickLabel(data: unknown, resourceType: string, resourceId: string): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of LABEL_KEYS) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 300);
    }
    // Articles nest title under translations.ar/en instead of a top-level field.
    const translations = obj.translations as Record<string, { title?: string } | null> | undefined;
    const nestedTitle = translations?.ar?.title || translations?.en?.title;
    if (nestedTitle) return nestedTitle.slice(0, 300);
  }
  return resourceId ? `${resourceType} #${resourceId}` : resourceType;
}

function pickResourceId(data: unknown, params: Record<string, string | string[] | undefined>): string {
  if (data && typeof data === "object" && "id" in data) {
    const id = (data as Record<string, unknown>).id;
    if (id !== undefined && id !== null) return String(id);
  }
  const paramId = params.id;
  return typeof paramId === "string" ? paramId : "";
}

function inferAction(method: string, path: string, body: unknown): string {
  if (path.endsWith("/status") && body && typeof body === "object" && typeof (body as Record<string, unknown>).action === "string") {
    return (body as Record<string, unknown>).action as string;
  }
  if (path.endsWith("/archived") && method === "PATCH") return "archive";
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "edit";
  if (method === "DELETE") return "delete";
  return method.toLowerCase();
}

// A short, bounded summary of the request body for the audit entry's
// "details" column -- primitive top-level fields only, so large payloads
// (article content blocks, base64 images) are never stored here.
function extractDetails(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string" && value.length > 0 && value.length <= 200 && !value.startsWith("data:")) {
      parts.push(`${key}=${value}`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    }
    if (parts.length >= 6) break;
  }
  return parts.length ? parts.join(", ").slice(0, 1000) : null;
}

async function writeAuditEntry(req: Request, res: Response, resourceType: string, data: unknown): Promise<void> {
  const user = req.user;
  if (!user) return;

  const action = inferAction(req.method, req.originalUrl.split("?")[0]!, req.body);
  const resourceId = pickResourceId(data, req.params);
  const resourceLabel = pickLabel(data, resourceType, resourceId);
  // A route can pre-compute an exact, already-serialized "new value" (and,
  // separately, a "previous value" read from the DB before its write) on
  // res.locals when the generic primitive-only extraction below can't
  // represent its body meaningfully -- e.g. a settings PUT whose body is
  // { value: {...nested object...} }, not flat fields (see
  // pricing.routes.ts's settings PUT, the one current user of this). Every
  // other route leaves both unset, so this changes nothing for them.
  const details = (res.locals.auditDetails as string | undefined) ?? extractDetails(req.body);
  const previousValue = res.locals.auditPreviousValue as string | undefined;
  // Optional free-text "why" for this change (Monetization Master Change
  // Directive v1.0 §15's "Reason / Change Note"). Same res.locals opt-in as
  // the two fields above -- unset, and thus NULL, for every route that
  // doesn't explicitly provide one.
  const reason = res.locals.auditReason as string | undefined;

  const [rows] = await pool.query<import("mysql2").RowDataPacket[]>("SELECT name FROM admin_users WHERE id = ?", [user.userId]);
  const userName = (rows[0]?.name as string | undefined) ?? user.email;

  await pool.query(
    `INSERT INTO audit_log (user_id, user_name, user_email, action, resource_type, resource_id, resource_label, details, previous_value, reason, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
    [user.userId, userName, user.email, action, resourceType, resourceId || null, resourceLabel, details, previousValue ?? null, reason ?? null]
  );
}

/** Generically records every successful mutation under /api/admin/* into the
 * audit log -- covers all current admin resources (and future ones, since it
 * infers the resource type from the URL rather than needing a per-route
 * hook) without touching each module's route handlers individually. */
export function auditLogMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === "GET") return next();

  const path = req.originalUrl.split("?")[0]!;
  const match = path.match(/^\/api\/admin\/([a-zA-Z_]+)/);
  const resourceType = match?.[1];
  if (!resourceType || EXCLUDED_RESOURCE_TYPES.has(resourceType)) return next();

  const originalJson = _res.json.bind(_res);
  _res.json = ((body: unknown) => {
    if (_res.statusCode < 400 && body && typeof body === "object" && (body as Record<string, unknown>).success === true) {
      const data = (body as Record<string, unknown>).data;
      writeAuditEntry(req, _res, resourceType, data).catch((err) => console.error("audit log write failed:", err));
    }
    return originalJson(body);
  }) as Response["json"];

  next();
}
