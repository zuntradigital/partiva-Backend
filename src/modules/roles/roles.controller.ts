import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  reloadPermissionCache,
  type PermissionAction,
  type PermissionResource,
} from "../../middleware/permissions.js";
import {
  createRole,
  findRoleById,
  findRoleByName,
  listRoles,
  updateRole,
  type RolePermission,
} from "./roles.repository.js";

const SUPER_ADMIN_ROLE = "Super Admin";

export const listRolesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await listRoles();
  res.status(200).json({ success: true, data: roles });
});

export const permissionRegistryHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { resources: PERMISSION_RESOURCES, actions: PERMISSION_ACTIONS } });
});

// Every permission a role/user can be granted must come from the registry
// above -- this is the only place a resource+action pair is validated
// against, so the UI never needs (and must never hardcode) its own list.
function readPermissions(body: Record<string, unknown>): RolePermission[] {
  const raw = body.permissions;
  if (!Array.isArray(raw)) throw new ApiError(422, "VALIDATION_ERROR", "permissions must be an array");

  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") throw new ApiError(422, "VALIDATION_ERROR", "Invalid permission entry");
    const { resource, action } = entry as Record<string, unknown>;
    if (!PERMISSION_RESOURCES.includes(resource as PermissionResource)) {
      throw new ApiError(422, "VALIDATION_ERROR", `Unknown permission resource: ${String(resource)}`);
    }
    if (!PERMISSION_ACTIONS.includes(action as PermissionAction)) {
      throw new ApiError(422, "VALIDATION_ERROR", `Unknown permission action: ${String(action)}`);
    }
    return { resource: resource as PermissionResource, action: action as PermissionAction };
  });
}

export const createRoleHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
  const nameAr = typeof body.nameAr === "string" && body.nameAr.trim() ? body.nameAr.trim() : null;
  const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;

  if (!nameEn) throw new ApiError(422, "VALIDATION_ERROR", "nameEn is required");
  if (await findRoleByName(nameEn)) throw new ApiError(409, "ROLE_ALREADY_EXISTS", "A role with this name already exists");

  const permissions = readPermissions(body);
  const roleId = await createRole(nameEn, nameAr, description, permissions);
  await reloadPermissionCache();

  const role = await findRoleById(roleId);
  res.status(201).json({ success: true, data: { ...role, permissions } });
});

export const updateRoleHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid role id");

  const role = await findRoleById(id);
  if (!role) throw new ApiError(404, "NOT_FOUND", "Role not found");
  // Super Admin's authority is hardcoded (it bypasses the permission table
  // entirely) -- editing its row here would silently do nothing, so block it
  // outright rather than let an admin believe they changed it.
  if (role.name === SUPER_ADMIN_ROLE) {
    throw new ApiError(400, "CANNOT_MODIFY_SUPER_ADMIN", "The Super Admin role cannot be edited");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const nameAr = body.nameAr === undefined ? undefined : typeof body.nameAr === "string" && body.nameAr.trim() ? body.nameAr.trim() : null;
  const description =
    body.description === undefined ? undefined : typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  const permissions = readPermissions(body);

  await updateRole(id, nameAr, description, permissions);
  await reloadPermissionCache();

  const updated = await findRoleById(id);
  res.status(200).json({ success: true, data: { ...updated, permissions } });
});
