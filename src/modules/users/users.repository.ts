import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import type { PermissionAction, PermissionResource } from "../../middleware/permissions.js";
import type { AdminUserRow } from "../../types/db.types.js";

export interface AdminUserWithRoles extends AdminUserRow {
  roles: string[];
}

export const listAdminUsers = async (): Promise<AdminUserWithRoles[]> => {
  const [users] = await pool.query<(AdminUserRow & RowDataPacket)[]>(
    "SELECT * FROM admin_users ORDER BY created_at DESC"
  );

  const [roleRows] = await pool.query<(RowDataPacket & { user_id: number; role_name: string })[]>(
    `SELECT ur.user_id, r.name AS role_name
     FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id`
  );

  const rolesByUserId = new Map<number, string[]>();
  for (const row of roleRows) {
    const roles = rolesByUserId.get(row.user_id) ?? [];
    roles.push(row.role_name);
    rolesByUserId.set(row.user_id, roles);
  }

  return users.map((user) => ({
    ...user,
    roles: rolesByUserId.get(user.id) ?? [],
  }));
};

export const findAdminUserRoles = async (userId: number): Promise<string[]> => {
  const [rows] = await pool.query<(RowDataPacket & { name: string })[]>(
    `SELECT r.name FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.name);
};

export const deleteAdminUser = async (id: number): Promise<boolean> => {
  const [result] = await pool.query<ResultSetHeader>("DELETE FROM admin_users WHERE id = ?", [id]);
  return result.affectedRows > 0;
};

export interface UserPermission {
  resource: PermissionResource;
  action: PermissionAction;
}

export const getUserPermissions = async (userId: number): Promise<UserPermission[]> => {
  const [rows] = await pool.query<(RowDataPacket & { resource: PermissionResource; action: PermissionAction })[]>(
    "SELECT resource, action FROM user_permissions WHERE user_id = ?",
    [userId]
  );
  return rows.map((r) => ({ resource: r.resource, action: r.action }));
};

// Additive-only, per the RBAC model: this replaces the full set of the
// user's own extra grants (on top of whatever their role already allows) --
// there is no deny/revoke concept here, only what's granted beyond the role.
export const replaceUserPermissions = async (userId: number, permissions: UserPermission[], grantedBy: number): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM user_permissions WHERE user_id = ?", [userId]);
    if (permissions.length > 0) {
      const values = permissions.map((p) => [userId, p.resource, p.action, grantedBy]);
      await connection.query("INSERT INTO user_permissions (user_id, resource, action, granted_by) VALUES ?", [values]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
