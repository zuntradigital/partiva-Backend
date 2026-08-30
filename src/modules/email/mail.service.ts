import { env } from "../../config/env.js";
import { mailTransport } from "./email.transport.js";

const DEFAULT_FROM_NAME = "Partiva Admin";

export class MailError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "MailError";
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Overrides the default "Partiva Admin <SMTP_FROM>" sender, if ever needed. */
  from?: string;
}

export interface SendEmailResult {
  messageId: string;
}

/** Generic, reusable email sender -- every outbound email in the backend
 * (invitations, future notifications, etc.) should go through this. */
export const sendEmail = async ({ to, subject, html, text, from }: SendEmailInput): Promise<SendEmailResult> => {
  try {
    const info = await mailTransport.sendMail({
      from: from ?? `"${DEFAULT_FROM_NAME}" <${env.smtp.from}>`,
      to,
      subject,
      html,
      text,
    });

    return { messageId: info.messageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Failed to send email to ${to}: ${reason}`);
    throw new MailError(`Failed to send email to ${to}`, error);
  }
};
