import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import type { PermissionAction, PermissionResource } from "../../middleware/permissions.js";
import type { RoleRow } from "../../types/db.types.js";

export interface RolePermission {
  resource: PermissionResource;
  action: PermissionAction;
}

export interface RoleWithPermissions extends RoleRow {
  permissions: RolePermission[];
}

export const listRoles = async (): Promise<RoleWithPermissions[]> => {
  const [roles] = await pool.query<(RoleRow & RowDataPacket)[]>("SELECT * FROM roles ORDER BY name ASC");
  const [permRows] = await pool.query<(RowDataPacket & { role_id: number; resource: PermissionResource; action: PermissionAction })[]>(
    "SELECT role_id, resource, action FROM role_permissions"
  );

  const permsByRole = new Map<number, RolePermission[]>();
  for (const row of permRows) {
    const list = permsByRole.get(row.role_id) ?? [];
    list.push({ resource: row.resource, action: row.action });
    permsByRole.set(row.role_id, list);
  }

  return roles.map((role) => ({ ...role, permissions: permsByRole.get(role.id) ?? [] }));
};

export const findRoleById = async (id: number): Promise<RoleRow | null> => {
  const [rows] = await pool.query<(RoleRow & RowDataPacket)[]>("SELECT * FROM roles WHERE id = ? LIMIT 1", [id]);
  return rows[0] ?? null;
};

export const findRoleByName = async (name: string): Promise<RoleRow | null> => {
  const [rows] = await pool.query<(RoleRow & RowDataPacket)[]>("SELECT * FROM roles WHERE name = ? LIMIT 1", [name]);
  return rows[0] ?? null;
};

export const createRole = async (
  name: string,
  nameAr: string | null,
  description: string | null,
  permissions: RolePermission[]
): Promise<number> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query<ResultSetHeader>(
      "INSERT INTO roles (name, name_ar, description) VALUES (?, ?, ?)",
      [name, nameAr, description]
    );
    const roleId = result.insertId;
    if (permissions.length > 0) {
      const values = permissions.map((p) => [roleId, p.resource, p.action]);
      await connection.query("INSERT INTO role_permissions (role_id, resource, action) VALUES ?", [values]);
    }
    await connection.commit();
    return roleId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateRole = async (
  id: number,
  nameAr: string | null | undefined,
  description: string | null | undefined,
  permissions: RolePermission[]
): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (nameAr !== undefined || description !== undefined) {
      const sets: string[] = [];
      const params: (string | null)[] = [];
      if (nameAr !== undefined) {
        sets.push("name_ar = ?");
        params.push(nameAr);
      }
      if (description !== undefined) {
        sets.push("description = ?");
        params.push(description);
      }
      params.push(String(id));
      await connection.query(`UPDATE roles SET ${sets.join(", ")} WHERE id = ?`, params);
    }
    await connection.query("DELETE FROM role_permissions WHERE role_id = ?", [id]);
    if (permissions.length > 0) {
      const values = permissions.map((p) => [id, p.resource, p.action]);
      await connection.query("INSERT INTO role_permissions (role_id, resource, action) VALUES ?", [values]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
