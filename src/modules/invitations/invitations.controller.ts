import type { Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as invitationsService from "./invitations.service.js";

export const createInvitationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, roleId } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    throw new ApiError(422, "VALIDATION_ERROR", "name is required");
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(422, "VALIDATION_ERROR", "A valid email is required");
  }
  if (typeof roleId !== "number" && typeof roleId !== "string") {
    throw new ApiError(422, "VALIDATION_ERROR", "roleId is required");
  }

  const invitation = await invitationsService.createInvitation({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    roleId: Number(roleId),
    invitedById: req.user!.userId,
  });

  res.status(201).json({ success: true, data: invitation });
});

export const listInvitationsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const invitations = await invitationsService.listPendingInvitations();

  res.status(200).json({ success: true, data: invitations });
});

export const verifyInvitationHandler = asyncHandler(async (req: Request, res: Response) => {
  const token = req.query.token;

  if (typeof token !== "string" || !token) {
    throw new ApiError(422, "VALIDATION_ERROR", "token is required");
  }

  const invitation = await invitationsService.verifyInvitation(token);

  res.status(200).json({ success: true, data: invitation });
});

export const acceptInvitationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body ?? {};

  if (typeof token !== "string" || !token) {
    throw new ApiError(422, "VALIDATION_ERROR", "token is required");
  }
  if (typeof password !== "string" || !password) {
    throw new ApiError(422, "VALIDATION_ERROR", "password is required");
  }

  const result = await invitationsService.acceptInvitation(token, password);

  res.status(200).json({ success: true, data: result });
});
