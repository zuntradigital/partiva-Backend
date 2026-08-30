import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

// Hostinger's SMTP relay (port 465) requires implicit TLS from the start of
// the connection, hence `secure: true` -- this is not a STARTTLS (587) setup.
export const mailTransport = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: true,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.password,
  },
});

export const verifySmtpConnection = async (): Promise<boolean> => {
  try {
    await mailTransport.verify();
    return true;
  } catch (error) {
    console.error(
      "SMTP connection verification failed:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
};
