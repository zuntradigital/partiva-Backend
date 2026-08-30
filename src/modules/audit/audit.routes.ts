import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

type AuditRow = RowDataPacket & {
  id: number; user_id: number | null; user_name: string | null; user_email: string | null;
  action: string; resource_type: string; resource_id: string | null; resource_label: string | null;
  details: string | null; result: "success" | "failure"; created_at: Date;
};

const mapEntry = (r: AuditRow) => ({
  id: r.id,
  actor: { id: String(r.user_id ?? ""), name: r.user_name ?? r.user_email ?? "—" },
  action: r.action,
  resourceType: r.resource_type,
  resourceId: r.resource_id ?? "",
  resourceLabel: r.resource_label ?? r.resource_type,
  newValue: r.details ?? undefined,
  timestamp: r.created_at,
  result: r.result,
});

const ACTION_LABELS_AR: Record<string, string> = {
  create: "إنشاء", edit: "تعديل", publish: "نشر", unpublish: "إلغاء نشر", archive: "أرشفة",
  delete: "حذف", approve: "اعتماد", reject: "رفض", schedule: "جدولة", submit_review: "إرسال للمراجعة",
};
const RESOURCE_LABELS_AR: Record<string, string> = {
  articles: "مقال", categories: "تصنيف", tags: "وسم", pricing: "باقة تسعير", testimonials: "رأي عميل",
  faq: "سؤال شائع", contact: "معلومات التواصل", users: "مستخدم", invitations: "دعوة", roles: "دور",
};
const ACTION_ICON: Record<string, string> = {
  create: "plus", edit: "edit", delete: "trash", publish: "check", approve: "check",
  reject: "alert", archive: "alert", unpublish: "alert", schedule: "check", submit_review: "send",
};
const ACTION_VARIANT: Record<string, "info" | "success" | "warning" | "danger"> = {
  create: "info", edit: "info", delete: "danger", publish: "success", approve: "success",
  reject: "danger", archive: "warning", unpublish: "warning", schedule: "info", submit_review: "info",
};

const mapNotification = (r: AuditRow, readAt: Date | null) => {
  const actionLabel = ACTION_LABELS_AR[r.action] ?? r.action;
  const resourceLabel = RESOURCE_LABELS_AR[r.resource_type] ?? r.resource_type;
  return {
    id: String(r.id),
    icon: ACTION_ICON[r.action] ?? "bell",
    titleAr: `${actionLabel} — ${resourceLabel}`,
    detailAr: `${r.user_name ?? r.user_email ?? "—"}: ${r.resource_label ?? resourceLabel}`,
    timestamp: r.created_at,
    read: readAt !== null && new Date(r.created_at) <= readAt,
    variant: ACTION_VARIANT[r.action] ?? "info",
  };
};

export const adminAuditRouter = Router();
adminAuditRouter.use(requireAuth);

adminAuditRouter.get("/", requirePermission("audit_log", "view"), asyncHandler(async (_req, res) => {
  const [rows] = await pool.query<AuditRow[]>("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500");
  res.json({ success: true, data: rows.map(mapEntry) });
}));

export const adminNotificationsRouter = Router();
adminNotificationsRouter.use(requireAuth);

adminNotificationsRouter.get("/", asyncHandler(async (req, res) => {
  const [[user]] = await pool.query<RowDataPacket[]>("SELECT notifications_read_at FROM admin_users WHERE id = ?", [req.user!.userId]);
  const readAt = (user?.notifications_read_at as Date | null) ?? null;
  const [rows] = await pool.query<AuditRow[]>("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 30");
  res.json({ success: true, data: rows.map((r) => mapNotification(r, readAt)) });
}));

adminNotificationsRouter.patch("/read", asyncHandler(async (req, res) => {
  await pool.query("UPDATE admin_users SET notifications_read_at = NOW() WHERE id = ?", [req.user!.userId]);
  res.json({ success: true, data: { readAt: new Date().toISOString() } });
}));
