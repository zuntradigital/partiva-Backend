import type { QueryError } from "mysql2";
import { ApiError } from "../../utils/apiError.js";
import { env } from "../../config/env.js";
import { generateInvitationToken, hashInvitationToken } from "../../utils/token.util.js";
import { hashPassword, isPasswordStrongEnough } from "../../utils/password.util.js";
import { sendInvitationEmail } from "../email/email.service.js";
import { findRoleById } from "../roles/roles.repository.js";
import * as invitationsRepository from "./invitations.repository.js";
import type { InvitationWithUserRow } from "./invitations.repository.js";

const isDuplicateEntryError = (error: unknown): error is QueryError => {
  return typeof error === "object" && error !== null && (error as QueryError).code === "ER_DUP_ENTRY";
};

const invitationExpiresAt = (): Date => {
  return new Date(Date.now() + env.invitationTokenExpiryHours * 60 * 60 * 1000);
};

interface CreateInvitationInput {
  name: string;
  email: string;
  roleId: number;
  invitedById: number;
}

export const createInvitation = async ({
  name,
  email,
  roleId,
  invitedById,
}: CreateInvitationInput) => {
  const role = await findRoleById(roleId);

  if (!role) {
    throw new ApiError(422, "VALIDATION_ERROR", "The selected role does not exist");
  }

  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = invitationExpiresAt();

  let userId: number;

  try {
    const created = await invitationsRepository.createInvitation({
      name,
      email,
      roleId,
      invitedById,
      tokenHash,
      expiresAt,
    });
    userId = created.userId;
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new ApiError(409, "USER_ALREADY_EXISTS", "An admin user with this email already exists");
    }
    throw error;
  }

  const inviteLink = `${env.adminAppUrl}/accept-invitation?token=${rawToken}`;

  // The invitation record is already committed at this point -- an email
  // delivery failure shouldn't surface as a generic 500 (the user WAS
  // created), so it's caught separately and reported via `emailSent`.
  let emailSent = true;
  try {
    await sendInvitationEmail(email, {
      recipientName: name,
      roleName: role.name,
      inviteLink,
      expiresAt,
    });
  } catch (error) {
    emailSent = false;
    console.error(
      `Invitation for ${email} was created but the email failed to send:`,
      error instanceof Error ? error.message : error
    );
  }

  return {
    id: userId,
    name,
    email,
    role: role.name,
    status: "invited" as const,
    expiresAt,
    emailSent,
  };
};

const assertInvitationIsUsable = (invitation: InvitationWithUserRow): void => {
  if (invitation.used_at !== null || invitation.user_status !== "invited") {
    throw new ApiError(410, "INVITATION_ALREADY_USED", "This invitation has already been used");
  }

  if (invitation.expires_at.getTime() < Date.now()) {
    throw new ApiError(410, "INVITATION_EXPIRED", "This invitation has expired");
  }
};

const getInvitationByRawTokenOrThrow = async (rawToken: string): Promise<InvitationWithUserRow> => {
  const tokenHash = hashInvitationToken(rawToken);
  const invitation = await invitationsRepository.findInvitationByTokenHash(tokenHash);

  if (!invitation) {
    throw new ApiError(400, "INVALID_TOKEN", "This invitation link is invalid");
  }

  return invitation;
};

export const verifyInvitation = async (rawToken: string) => {
  const invitation = await getInvitationByRawTokenOrThrow(rawToken);
  assertInvitationIsUsable(invitation);

  return {
    name: invitation.user_name,
    email: invitation.user_email,
    role: invitation.role_name,
    expiresAt: invitation.expires_at,
  };
};

export const acceptInvitation = async (rawToken: string, password: string) => {
  if (!isPasswordStrongEnough(password)) {
    throw new ApiError(422, "VALIDATION_ERROR", "Password must be at least 8 characters long");
  }

  const invitation = await getInvitationByRawTokenOrThrow(rawToken);
  assertInvitationIsUsable(invitation);

  const passwordHash = await hashPassword(password);

  try {
    await invitationsRepository.acceptInvitation(invitation.id, invitation.user_id, passwordHash);
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_USED") {
      throw new ApiError(410, "INVITATION_ALREADY_USED", "This invitation has already been used");
    }
    throw error;
  }

  return {
    email: invitation.user_email,
  };
};

export const listPendingInvitations = async () => {
  const invitations = await invitationsRepository.listPendingInvitations();

  return invitations.map((invitation) => ({
    id: invitation.id,
    name: invitation.user_name,
    email: invitation.user_email,
    role: invitation.role_name,
    invitedAt: invitation.created_at,
    expiresAt: invitation.expires_at,
  }));
};
