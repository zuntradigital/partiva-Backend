import { env } from "../config/env.js";
import { verifySmtpConnection } from "../modules/email/email.transport.js";
import { sendEmail } from "../modules/email/mail.service.js";

const recipient = process.argv[2];

if (!recipient) {
  console.error("Usage: npm run test:email -- <recipient-email>");
  process.exit(1);
}

const run = async () => {
  console.log(`Verifying SMTP connection to ${env.smtp.host}:${env.smtp.port} as ${env.smtp.user}...`);

  const connected = await verifySmtpConnection();
  if (!connected) {
    console.error("SMTP verification failed -- check SMTP_HOST/PORT/USER/PASSWORD in .env.");
    process.exit(1);
  }
  console.log("SMTP connection verified.");

  console.log(`Sending test email to ${recipient}...`);
  const { messageId } = await sendEmail({
    to: recipient,
    subject: "Partiva Admin -- SMTP test email",
    html: "<p>This is a test email confirming Hostinger SMTP is configured correctly for Partiva Admin.</p>",
    text: "This is a test email confirming Hostinger SMTP is configured correctly for Partiva Admin.",
  });

  console.log(`Test email sent successfully. messageId: ${messageId}`);
};

run().catch((error) => {
  console.error("Test email failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
