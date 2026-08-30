import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { findAdminUserById } from "../auth/auth.repository.js";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  reloadPermissionCache,
  rolePermissionsFor,
  type PermissionAction,
  type PermissionResource,
} from "../../middleware/permissions.js";
import {
  deleteAdminUser,
  findAdminUserRoles,
  getUserPermissions,
  listAdminUsers,
  replaceUserPermissions,
  type UserPermission,
} from "./users.repository.js";

// A user is considered "online" if they've made an authenticated request
// (which touches last_seen_at, see auth.middleware.ts) within this window.
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

const isOnline = (lastSeenAt: Date | null): boolean => {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
};

export const listUsersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const users = await listAdminUsers();

  res.status(200).json({
    success: true,
    data: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      roles: user.roles,
      createdAt: user.created_at,
      lastSeenAt: user.last_seen_at,
      isOnline: isOnline(user.last_seen_at),
    })),
  });
});

export const deleteUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const targetId = Number(req.params.id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid user id");
  }

  if (targetId === req.user!.userId) {
    throw new ApiError(400, "CANNOT_DELETE_SELF", "You cannot delete your own account");
  }

  const target = await findAdminUserById(targetId);
  if (!target) {
    throw new ApiError(404, "NOT_FOUND", "User not found");
  }

  await deleteAdminUser(targetId);

  res.status(200).json({ success: true, data: { id: targetId } });
});

export const getUserPermissionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid user id");

  const target = await findAdminUserById(targetId);
  if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");

  const roles = await findAdminUserRoles(targetId);
  const userPermissions = await getUserPermissions(targetId);

  res.status(200).json({
    success: true,
    data: {
      roles,
      rolePermissions: rolePermissionsFor(roles),
      userPermissions,
    },
  });
});

export const updateUserPermissionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) throw new ApiError(422, "VALIDATION_ERROR", "Invalid user id");

  const target = await findAdminUserById(targetId);
  if (!target) throw new ApiError(404, "NOT_FOUND", "User not found");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const raw = body.permissions;
  if (!Array.isArray(raw)) throw new ApiError(422, "VALIDATION_ERROR", "permissions must be an array");

  const permissions: UserPermission[] = raw.map((entry) => {
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

  await replaceUserPermissions(targetId, permissions, req.user!.userId);
  await reloadPermissionCache();

  const roles = await findAdminUserRoles(targetId);
  res.status(200).json({
    success: true,
    data: { roles, rolePermissions: rolePermissionsFor(roles), userPermissions: permissions },
  });
});
