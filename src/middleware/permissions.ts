import type { NextFunction, Request, Response } from "express";
import type { RowDataPacket } from "mysql2";
import pool from "../config/database.js";
import { ApiError } from "../utils/apiError.js";

// Single source of truth for both the type union (compile-time) and the
// runtime registry the Dashboard's role editor renders checkboxes from --
// no separate hardcoded UI list.
export const PERMISSION_RESOURCES = [
  "articles", "categories_tags", "pricing", "testimonials", "faq", "contact_info", "audit_log", "pages", "media",
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_ACTIONS = [
  "view", "create", "edit", "submit_review", "approve", "publish", "archive", "delete",
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

const SUPER_ADMIN_ROLE = "Super Admin";

/** Role- and user-level permission grants, loaded from role_permissions /
 * user_permissions (see migration 024) into memory so hasPermission stays
 * synchronous -- reloaded whenever either table is written to. This
 * replaces the previously hardcoded ROLE_PERMISSIONS object; Editor/Author/
 * Sales keep the exact same grants, now DB-backed so Super Admin can also
 * create/edit roles and grant per-user extras through the Dashboard. */
let roleCache: Record<string, Partial<Record<PermissionResource, PermissionAction[]>>> = {};
let userCache: Record<number, Partial<Record<PermissionResource, PermissionAction[]>>> = {};

export async function reloadPermissionCache(): Promise<void> {
  const [roleRows] = await pool.query<(RowDataPacket & { name: string; resource: PermissionResource; action: PermissionAction })[]>(
    "SELECT r.name, rp.resource, rp.action FROM role_permissions rp INNER JOIN roles r ON r.id = rp.role_id"
  );
  const nextRoleCache: typeof roleCache = {};
  for (const row of roleRows) {
    const bucket = (nextRoleCache[row.name] ??= {});
    (bucket[row.resource] ??= []).push(row.action);
  }
  roleCache = nextRoleCache;

  const [userRows] = await pool.query<(RowDataPacket & { user_id: number; resource: PermissionResource; action: PermissionAction })[]>(
    "SELECT user_id, resource, action FROM user_permissions"
  );
  const nextUserCache: typeof userCache = {};
  for (const row of userRows) {
    const bucket = (nextUserCache[row.user_id] ??= {});
    (bucket[row.resource] ??= []).push(row.action);
  }
  userCache = nextUserCache;
}

export function hasPermission(userId: number, roles: string[], resource: PermissionResource, action: PermissionAction): boolean {
  if (roles.includes(SUPER_ADMIN_ROLE)) return true;
  if (roles.some((role) => roleCache[role]?.[resource]?.includes(action))) return true;
  return userCache[userId]?.[resource]?.includes(action) ?? false;
}

function mergeBuckets(buckets: (Partial<Record<PermissionResource, PermissionAction[]>> | undefined)[]): Partial<Record<PermissionResource, PermissionAction[]>> {
  const merged: Partial<Record<PermissionResource, Set<PermissionAction>>> = {};
  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const [resource, actions] of Object.entries(bucket) as [PermissionResource, PermissionAction[]][]) {
      const set = (merged[resource] ??= new Set());
      actions.forEach((a) => set.add(a));
    }
  }
  return Object.fromEntries(Object.entries(merged).map(([r, set]) => [r, [...set!]])) as Partial<Record<PermissionResource, PermissionAction[]>>;
}

/** Permissions granted purely by role membership (no user-specific extras) --
 * this is the "صلاحيات الدور" half of the Dashboard's user-permissions view. */
export function rolePermissionsFor(roles: string[]): Partial<Record<PermissionResource, PermissionAction[]>> {
  if (roles.includes(SUPER_ADMIN_ROLE)) {
    return Object.fromEntries(PERMISSION_RESOURCES.map((r) => [r, [...PERMISSION_ACTIONS]])) as Record<PermissionResource, PermissionAction[]>;
  }
  return mergeBuckets(roles.map((role) => roleCache[role]));
}

/** Effective permissions for a user (role grants + their own extras merged),
 * used by the Dashboard's client-side can() so custom roles and per-user
 * grants aren't just enforced server-side but also reflected in the UI. */
export function effectivePermissions(userId: number, roles: string[]): Partial<Record<PermissionResource, PermissionAction[]>> {
  if (roles.includes(SUPER_ADMIN_ROLE)) return rolePermissionsFor(roles);
  return mergeBuckets([...roles.map((role) => roleCache[role]), userCache[userId]]);
}

export function requirePermission(resource: PermissionResource, action: PermissionAction) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!hasPermission(req.user?.userId ?? -1, req.user?.roles ?? [], resource, action)) {
      // Logged before throwing -- the client still gets the exact same 403
      // ApiError/message as before, this just also records the attempt
      // server-side for abuse/privilege-escalation monitoring.
      console.warn(
        "[security] permission_denied",
        JSON.stringify({
          userId: req.user?.userId ?? null,
          roles: req.user?.roles ?? [],
          resource,
          action,
          ip: req.ip,
          at: new Date().toISOString(),
        })
      );
      throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action");
    }
    next();
  };
}
