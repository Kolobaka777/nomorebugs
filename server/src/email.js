import nodemailer from 'nodemailer';

// Reserve/fallback channel only — Telegram is the primary notification
// path (see telegram.js's notifyUser). Entirely inert until SMTP_HOST/
// SMTP_USER/SMTP_PASS are set, matching the "only needs API keys in prod"
// scaffolding pattern used for the other prod-readiness integrations.
const transporter = (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

export function isEmailConfigured() {
  return !!transporter;
}

export async function sendEmail(to, subject, text) {
  if (!transporter) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[SMTP not configured — would send] to=${to} subject="${subject}"`);
    }
    return false;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text,
    });
    return true;
  } catch (err) {
    console.error('Failed to send fallback email:', err.message);
    return false;
  }
}
