import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "../../config/database.js";
import type { AdminInvitationRow, AdminUserStatus } from "../../types/db.types.js";

interface CreateInvitationInput {
  name: string;
  email: string;
  roleId: number;
  invitedById: number;
  tokenHash: string;
  expiresAt: Date;
}

interface CreateInvitationResult {
  userId: number;
  invitationId: number;
}

export const createInvitation = async (
  input: CreateInvitationInput
): Promise<CreateInvitationResult> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [userResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO admin_users (name, email, status, created_by)
       VALUES (?, ?, 'invited', ?)`,
      [input.name, input.email, input.invitedById]
    );
    const userId = userResult.insertId;

    await connection.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       VALUES (?, ?, ?)`,
      [userId, input.roleId, input.invitedById]
    );

    const [invitationResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO admin_invitations (user_id, role_id, token_hash, invited_by, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, input.roleId, input.tokenHash, input.invitedById, input.expiresAt]
    );

    await connection.commit();

    return { userId, invitationId: invitationResult.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export interface InvitationWithUserRow extends AdminInvitationRow {
  user_name: string;
  user_email: string;
  user_status: AdminUserStatus;
  role_name: string;
}

export const findInvitationByTokenHash = async (
  tokenHash: string
): Promise<InvitationWithUserRow | null> => {
  const [rows] = await pool.query<(InvitationWithUserRow & RowDataPacket)[]>(
    `SELECT
       ai.*,
       au.name AS user_name,
       au.email AS user_email,
       au.status AS user_status,
       r.name AS role_name
     FROM admin_invitations ai
     INNER JOIN admin_users au ON au.id = ai.user_id
     INNER JOIN roles r ON r.id = ai.role_id
     WHERE ai.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );

  return rows[0] ?? null;
};

export const acceptInvitation = async (
  invitationId: number,
  userId: number,
  passwordHash: string
): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Guard against a token being redeemed twice concurrently: only the
    // request that flips used_at from NULL actually proceeds.
    const [invitationUpdateResult] = await connection.query<ResultSetHeader>(
      `UPDATE admin_invitations SET used_at = NOW()
       WHERE id = ? AND used_at IS NULL`,
      [invitationId]
    );

    if (invitationUpdateResult.affectedRows === 0) {
      throw new Error("INVITATION_ALREADY_USED");
    }

    await connection.query(
      `UPDATE admin_users SET password_hash = ?, status = 'active'
       WHERE id = ?`,
      [passwordHash, userId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const listPendingInvitations = async (): Promise<InvitationWithUserRow[]> => {
  const [rows] = await pool.query<(InvitationWithUserRow & RowDataPacket)[]>(
    `SELECT
       ai.*,
       au.name AS user_name,
       au.email AS user_email,
       au.status AS user_status,
       r.name AS role_name
     FROM admin_invitations ai
     INNER JOIN admin_users au ON au.id = ai.user_id
     INNER JOIN roles r ON r.id = ai.role_id
     WHERE ai.used_at IS NULL
     ORDER BY ai.created_at DESC`
  );

  return rows;
};
