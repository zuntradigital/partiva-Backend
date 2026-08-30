import type { RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import type { AdminUserRow } from "../../types/db.types.js";

export const findAdminUserByEmail = async (email: string): Promise<AdminUserRow | null> => {
  const [rows] = await pool.query<(AdminUserRow & RowDataPacket)[]>(
    "SELECT * FROM admin_users WHERE email = ? LIMIT 1",
    [email]
  );

  return rows[0] ?? null;
};

export const findAdminUserById = async (id: number): Promise<AdminUserRow | null> => {
  const [rows] = await pool.query<(AdminUserRow & RowDataPacket)[]>(
    "SELECT * FROM admin_users WHERE id = ? LIMIT 1",
    [id]
  );

  return rows[0] ?? null;
};

export const touchLastSeen = async (userId: number): Promise<void> => {
  await pool.query("UPDATE admin_users SET last_seen_at = NOW() WHERE id = ?", [userId]);
};

export const clearLastSeen = async (userId: number): Promise<void> => {
  await pool.query("UPDATE admin_users SET last_seen_at = NULL WHERE id = ?", [userId]);
};

// Invalidates every token previously issued to this user (see jwt.util.ts /
// requireAuth) -- called on logout so a token can't keep authenticating
// after the user has explicitly signed out.
export const incrementTokenVersion = async (userId: number): Promise<void> => {
  await pool.query("UPDATE admin_users SET token_version = token_version + 1 WHERE id = ?", [userId]);
};

export const getRoleNamesForUser = async (userId: number): Promise<string[]> => {
  const [rows] = await pool.query<(RowDataPacket & { name: string })[]>(
    `SELECT r.name FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ?`,
    [userId]
  );

  return rows.map((row) => row.name);
};
