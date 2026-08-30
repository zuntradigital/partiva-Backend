export interface InvitationEmailParams {
  recipientName: string;
  roleName: string;
  inviteLink: string;
  expiresAt: Date;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const formatExpiry = (expiresAt: Date): string => {
  return expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const buildInvitationEmail = ({
  recipientName,
  roleName,
  inviteLink,
  expiresAt,
}: InvitationEmailParams): EmailContent => {
  const subject = "You're invited to Partiva Admin CMS";
  const expiryText = formatExpiry(expiresAt);

  const html = `
  <div style="background-color:#f4f5f7;padding:32px 16px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="background-color:#111827;padding:24px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;">Partiva Admin</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">You've been invited</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
            Hi ${escapeHtml(recipientName)},
          </p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
            You have been invited to join the <strong>Partiva Admin CMS</strong> with the role of
            <strong>${escapeHtml(roleName)}</strong>. Click the button below to set up your account.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${inviteLink}" style="background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;display:inline-block;">
              Accept Invitation
            </a>
          </div>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;word-break:break-all;">
            <a href="${inviteLink}" style="color:#2563eb;">${inviteLink}</a>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6b7280;">
            This invitation link expires on <strong>${expiryText}</strong>.
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">
            If you weren't expecting this invitation, you can safely ignore this email — no account will be created without you completing the setup.
          </p>
        </td>
      </tr>
    </table>
  </div>`;

  const text = [
    `Hi ${recipientName},`,
    "",
    `You have been invited to join the Partiva Admin CMS with the role of ${roleName}.`,
    "",
    "Accept your invitation:",
    inviteLink,
    "",
    `This invitation link expires on ${expiryText}.`,
    "",
    "If you weren't expecting this invitation, you can safely ignore this email.",
  ].join("\n");

  return { subject, html, text };
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
