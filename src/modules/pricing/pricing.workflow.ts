import type { PermissionAction } from "../../middleware/permissions.js";

/** Mirrors articles.workflow.ts's shape, scaled down to the simpler
 * draft -> review -> (approved & published) / rejected cycle described for
 * Pricing. `null` pending_status means "no revision in flight". */
export type PricingStatus = "draft" | "review" | "rejected";
export type PricingWorkflowAction = "submit_review" | "approve" | "reject";

const AVAILABLE_TRANSITIONS: Record<PricingStatus, PricingWorkflowAction[]> = {
  draft: ["submit_review"],
  review: ["approve", "reject"],
  // A rejected plan is edited (which resets it to "draft") before it can be resubmitted.
  rejected: [],
};

const REQUIRED_PERMISSION: Record<PricingWorkflowAction, PermissionAction> = {
  submit_review: "submit_review",
  approve: "approve",
  reject: "approve",
};

export function isValidPricingTransition(status: PricingStatus, action: PricingWorkflowAction): boolean {
  return AVAILABLE_TRANSITIONS[status]?.includes(action) ?? false;
}

export function pricingPermissionRequiredFor(action: PricingWorkflowAction): PermissionAction {
  return REQUIRED_PERMISSION[action];
}

export function isPricingWorkflowAction(value: unknown): value is PricingWorkflowAction {
  return value === "submit_review" || value === "approve" || value === "reject";
}
