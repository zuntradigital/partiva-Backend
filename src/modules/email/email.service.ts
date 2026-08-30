import { sendEmail } from "./mail.service.js";
import { buildInvitationEmail, type InvitationEmailParams } from "./templates/invitationEmail.template.js";

export const sendInvitationEmail = async (to: string, params: InvitationEmailParams): Promise<void> => {
  const { subject, html, text } = buildInvitationEmail(params);

  await sendEmail({ to, subject, html, text });
};
