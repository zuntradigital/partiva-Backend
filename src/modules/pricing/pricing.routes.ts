import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission, hasPermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import {
  isValidPricingTransition,
  isPricingWorkflowAction,
  pricingPermissionRequiredFor,
  type PricingStatus,
  type PricingWorkflowAction,
} from "./pricing.workflow.js";

type Plan = RowDataPacket & {
  id: number; name_ar: string; name_en: string | null; description_ar: string; description_en: string | null;
  price: string; price_label_ar: string | null; currency: string; billing_period: string;
  features_ar: string[]; features_en: string[] | null; cta_text_ar: string; cta_text_en: string | null;
  cta_target: string; badge_ar: string | null; badge_en: string | null; display_order: number; active: boolean;
  pending_status: PricingStatus | null; pending_changes: PlanFields | null; submitted_by: number | null;
  rejection_comment: string | null; created_at: Date; updated_at: Date;
};

// The content fields Sales/Editor can propose -- deliberately excludes
// `active`, which is governed by the workflow (publish/approve), not typed
// directly into a draft.
type PlanFields = {
  nameAr: string; nameEn: string | null; descriptionAr: string; descriptionEn: string | null;
  price: number; currency: string; billingPeriod: string; featuresAr: string[]; featuresEn: string[] | null;
  ctaTextAr: string; ctaTextEn: string | null; ctaTarget: string; badgeAr: string | null; badgeEn: string | null;
  displayOrder: number;
};

const map = (p: Plan) => ({
  id: p.id, nameAr: p.name_ar, nameEn: p.name_en, descriptionAr: p.description_ar, descriptionEn: p.description_en,
  price: Number(p.price), priceLabelAr: p.price_label_ar, currency: p.currency, billingPeriod: p.billing_period,
  featuresAr: p.features_ar, featuresEn: p.features_en, ctaTextAr: p.cta_text_ar, ctaTextEn: p.cta_text_en,
  ctaTarget: p.cta_target, badgeAr: p.badge_ar, badgeEn: p.badge_en, displayOrder: p.display_order,
  active: Boolean(p.active), createdAt: p.created_at, updatedAt: p.updated_at,
});

// Admin view additionally exposes the workflow state so the Dashboard can
// show "Published $100 / Draft $120" side by side.
const mapAdmin = (p: Plan) => ({
  ...map(p),
  pendingStatus: p.pending_status,
  pendingChanges: p.pending_changes,
  rejectionComment: p.rejection_comment,
});

const planId = (raw: string) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(422, "VALIDATION_ERROR", "Invalid pricing plan id");
  return id;
};

function cleanFields(b: Record<string, unknown>): PlanFields {
  const s = (v: unknown, n: string, needed = true, max = 500): string | null => {
    if (v === undefined || v === null || v === "") {
      if (!needed) return null;
      throw new ApiError(422, "VALIDATION_ERROR", `${n} is required`);
    }
    if (typeof v !== "string" || v.length > max) throw new ApiError(422, "VALIDATION_ERROR", `Invalid ${n}`);
    return v.trim();
  };
  const price = Number(b.price);
  const order = Number(b.displayOrder);
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(order) || order < 0)
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid pricing details");
  if (!Array.isArray(b.featuresAr) || b.featuresAr.some((x) => typeof x !== "string" || !x.trim()))
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid pricing details");
  return {
    nameAr: s(b.nameAr, "nameAr", true, 200)!, nameEn: s(b.nameEn, "nameEn", false, 200),
    descriptionAr: s(b.descriptionAr, "descriptionAr")!, descriptionEn: s(b.descriptionEn, "descriptionEn", false),
    price, currency: s(b.currency, "currency", true, 10)!, billingPeriod: s(b.billingPeriod, "billingPeriod", true, 50)!,
    featuresAr: b.featuresAr as string[], featuresEn: b.featuresEn ? (b.featuresEn as string[]) : null,
    ctaTextAr: s(b.ctaTextAr, "ctaTextAr", true, 200)!, ctaTextEn: s(b.ctaTextEn, "ctaTextEn", false, 200),
    ctaTarget: s(b.ctaTarget, "ctaTarget", true, 200)!, badgeAr: s(b.badgeAr, "badgeAr", false, 200),
    badgeEn: s(b.badgeEn, "badgeEn", false, 200), displayOrder: order,
  };
}

const FIELD_SQL = "name_ar=?,name_en=?,description_ar=?,description_en=?,price=?,currency=?,billing_period=?,features_ar=?,features_en=?,cta_text_ar=?,cta_text_en=?,cta_target=?,badge_ar=?,badge_en=?,display_order=?";
const fieldValues = (f: PlanFields) => [
  f.nameAr, f.nameEn, f.descriptionAr, f.descriptionEn, f.price, f.currency, f.billingPeriod,
  JSON.stringify(f.featuresAr), f.featuresEn ? JSON.stringify(f.featuresEn) : null,
  f.ctaTextAr, f.ctaTextEn, f.ctaTarget, f.badgeAr, f.badgeEn, f.displayOrder,
];

const get = async (id: number): Promise<Plan> => {
  const [r] = await pool.query<Plan[]>("SELECT * FROM pricing_plans WHERE id=?", [id]);
  if (!r[0]) throw new ApiError(404, "NOT_FOUND", "Pricing plan not found");
  return r[0];
};

// ---- Public (website) ----
// Unchanged: only ever reads the live columns of active plans. A plan under
// review or with a pending revision is untouched here -- the public site
// keeps showing whatever was last approved.
export const publicPricingRouter = Router();
publicPricingRouter.get("/", asyncHandler(async (_req, res) => {
  const [plans, settings] = await Promise.all([
    pool.query<Plan[]>("SELECT * FROM pricing_plans WHERE active=TRUE ORDER BY display_order,id"),
    pool.query<(RowDataPacket & { value: unknown })[]>("SELECT value FROM pricing_settings WHERE setting_key='custom_contact'"),
  ]);
  res.json({ success: true, data: { plans: plans[0].map(map), customContact: settings[0][0]?.value ?? null } });
}));

// ---- Admin (dashboard) ----
export const adminPricingRouter = Router();
adminPricingRouter.use(requireAuth);

adminPricingRouter.get("/", requirePermission("pricing", "view"), asyncHandler(async (_req, res) => {
  const [r] = await pool.query<Plan[]>("SELECT * FROM pricing_plans ORDER BY display_order,id");
  res.json({ success: true, data: r.map(mapAdmin) });
}));

// A plan with no prior "approve" grant (Sales) always starts as a draft --
// nothing is live yet, so it's edited directly in its main columns.
// Editor/Super Admin (who can "approve") publish immediately since they
// already have full authority.
adminPricingRouter.post("/", requirePermission("pricing", "create"), asyncHandler(async (req, res) => {
  const fields = cleanFields(req.body ?? {});
  const elevated = hasPermission(req.user!.userId, req.user!.roles, "pricing", "approve");
  const [r] = await pool.query<ResultSetHeader>(
    `INSERT INTO pricing_plans (${FIELD_SQL.replace(/=\?/g, "")}, active, pending_status, submitted_by) VALUES (${"?,".repeat(15)}?,?,?)`,
    [...fieldValues(fields), elevated, elevated ? null : "draft", elevated ? null : req.user!.userId]
  );
  res.status(201).json({ success: true, data: mapAdmin(await get(r.insertId)) });
}));

// Sales editing an already-published plan buffers the change in
// pending_changes instead of touching the live columns, so the public site
// is unaffected until an Editor approves. Editor/Super Admin edits apply
// immediately (they can already publish, so there is nothing to buffer).
adminPricingRouter.put("/:id", requirePermission("pricing", "edit"), asyncHandler(async (req, res) => {
  const id = planId(String(req.params.id));
  const existing = await get(id);
  const fields = cleanFields(req.body ?? {});
  const elevated = hasPermission(req.user!.userId, req.user!.roles, "pricing", "approve");

  if (existing.pending_status === "review" && !elevated) {
    throw new ApiError(403, "FORBIDDEN", "This pricing change is already submitted for review and cannot be edited");
  }

  if (elevated) {
    // Direct authority: write straight to the live columns and clear any
    // pending revision this edit supersedes.
    await pool.query(`UPDATE pricing_plans SET ${FIELD_SQL}, pending_status=NULL, pending_changes=NULL WHERE id=?`, [...fieldValues(fields), id]);
  } else if (existing.active) {
    // Published plan, non-elevated editor: buffer the proposal.
    await pool.query("UPDATE pricing_plans SET pending_status='draft', pending_changes=?, submitted_by=? WHERE id=?", [JSON.stringify(fields), req.user!.userId, id]);
  } else {
    // Not yet published (new or previously rejected) -- edit the working draft directly.
    await pool.query(`UPDATE pricing_plans SET ${FIELD_SQL}, pending_status='draft', submitted_by=? WHERE id=?`, [...fieldValues(fields), req.user!.userId, id]);
  }

  res.json({ success: true, data: mapAdmin(await get(id)) });
}));

adminPricingRouter.delete("/:id", requirePermission("pricing", "delete"), asyncHandler(async (req, res) => {
  const id = planId(String(req.params.id));
  const [r] = await pool.query<ResultSetHeader>("DELETE FROM pricing_plans WHERE id=?", [id]);
  if (!r.affectedRows) throw new ApiError(404, "NOT_FOUND", "Pricing plan not found");
  res.json({ success: true, data: { id } });
}));

// Workflow transitions: submit_review (Sales), approve/reject (Editor/Super
// Admin). Mirrors articles' PATCH /:id/status pattern exactly.
adminPricingRouter.patch("/:id/status", asyncHandler(async (req, res) => {
  if (!isPricingWorkflowAction(req.body?.action)) throw new ApiError(422, "VALIDATION_ERROR", "Invalid workflow action");
  const action: PricingWorkflowAction = req.body.action;
  const id = planId(String(req.params.id));
  const existing = await get(id);

  if (!hasPermission(req.user!.userId, req.user!.roles, "pricing", pricingPermissionRequiredFor(action))) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action");
  }
  if (!existing.pending_status || !isValidPricingTransition(existing.pending_status, action)) {
    throw new ApiError(409, "INVALID_TRANSITION", `Cannot ${action} a plan in status "${existing.pending_status ?? "published"}"`);
  }

  if (action === "submit_review") {
    await pool.query("UPDATE pricing_plans SET pending_status='review' WHERE id=?", [id]);
  } else if (action === "reject") {
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    if (!comment) throw new ApiError(422, "VALIDATION_ERROR", "A comment is required to reject a pricing change");
    await pool.query("UPDATE pricing_plans SET pending_status='rejected', rejection_comment=? WHERE id=?", [comment, id]);
  } else {
    // approve -- merge the pending proposal (if any; a brand-new plan's
    // draft already lives in the main columns) into the live row and publish.
    if (existing.pending_changes) {
      await pool.query(`UPDATE pricing_plans SET ${FIELD_SQL}, active=TRUE, pending_status=NULL, pending_changes=NULL, rejection_comment=NULL WHERE id=?`, [...fieldValues(existing.pending_changes), id]);
    } else {
      await pool.query("UPDATE pricing_plans SET active=TRUE, pending_status=NULL, rejection_comment=NULL WHERE id=?", [id]);
    }
  }

  res.json({ success: true, data: mapAdmin(await get(id)) });
}));
