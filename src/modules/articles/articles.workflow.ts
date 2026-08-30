import type { ContentStatus } from "../../types/db.types.js";
import type { PermissionAction } from "../../middleware/permissions.js";

/** Mirrors the dashboard's publishing state machine (src/lib/workflow.ts) exactly --
 * enforced here server-side, not just used to filter buttons in the UI. */
export type WorkflowAction = "submit_review" | "approve" | "reject" | "schedule" | "publish" | "unpublish" | "archive";

const AVAILABLE_TRANSITIONS: Record<ContentStatus, WorkflowAction[]> = {
  draft: ["submit_review"],
  review: ["approve", "reject"],
  approved: ["schedule", "publish"],
  scheduled: ["publish"],
  published: ["unpublish", "archive"],
  unpublished: ["publish", "archive"],
  archived: ["publish"],
};

const NEXT_STATUS: Record<WorkflowAction, ContentStatus> = {
  submit_review: "review",
  approve: "approved",
  reject: "draft",
  schedule: "scheduled",
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
};

const REQUIRED_PERMISSION: Record<WorkflowAction, PermissionAction> = {
  submit_review: "submit_review",
  approve: "approve",
  reject: "approve",
  schedule: "publish",
  publish: "publish",
  unpublish: "publish",
  archive: "archive",
};

export function isValidTransition(currentStatus: ContentStatus, action: WorkflowAction): boolean {
  return AVAILABLE_TRANSITIONS[currentStatus].includes(action);
}

export function nextStatusFor(action: WorkflowAction): ContentStatus {
  return NEXT_STATUS[action];
}

export function permissionRequiredFor(action: WorkflowAction): PermissionAction {
  return REQUIRED_PERMISSION[action];
}

export function isWorkflowAction(value: unknown): value is WorkflowAction {
  return typeof value === "string" && value in NEXT_STATUS;
}
