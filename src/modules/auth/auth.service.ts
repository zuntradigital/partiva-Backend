import { ApiError } from "../../utils/apiError.js";
import { comparePassword } from "../../utils/password.util.js";
import { signAuthToken } from "../../utils/jwt.util.js";
import { effectivePermissions, type PermissionAction, type PermissionResource } from "../../middleware/permissions.js";
import { findAdminUserByEmail, getRoleNamesForUser } from "./auth.repository.js";

export interface LoginResult {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    roles: string[];
    // Role permissions merged with this user's own extra grants -- the
    // Dashboard's can() reads this directly so custom roles and per-user
    // grants affect the UI, not just backend enforcement.
    permissions: Partial<Record<PermissionResource, PermissionAction[]>>;
  };
}

export const login = async (email: string, password: string): Promise<LoginResult> => {
  const invalidCredentialsError = new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");

  const user = await findAdminUserByEmail(email);

  // status !== 'active' also covers users with no password_hash yet
  // (invited but not yet accepted) without leaking which case it is.
  if (!user || user.status !== "active" || !user.password_hash) {
    throw invalidCredentialsError;
  }

  const passwordMatches = await comparePassword(password, user.password_hash);

  if (!passwordMatches) {
    throw invalidCredentialsError;
  }

  const roles = await getRoleNamesForUser(user.id);

  const token = signAuthToken({ userId: user.id, email: user.email, roles, tokenVersion: user.token_version });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      permissions: effectivePermissions(user.id, roles),
    },
  };
};
