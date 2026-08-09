import nodemailer from 'nodemailer';

// Sends the "you just bought coins" receipt to the address the player
// registered their account with (never a client-supplied address) so a
// purchase always confirms to the mailbox that actually owns the account.
//
// Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (+ optional SMTP_FROM) to
// send real email. Without them, this falls back to just logging the email
// that *would* have been sent — same DEMO-mode pattern as paymentHub.js/db.js
// so local/dev setups keep working with zero extra setup.
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'Kombat Hamster <no-reply@kombathamster.app>';

export function emailConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

if (!emailConfigured()) {
  console.warn('[email] SMTP_HOST/SMTP_USER/SMTP_PASS not set — purchase receipt emails will only be logged (DEMO mode).');
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

function formatGhs(amount) {
  return `GH₵${Number(amount).toLocaleString()}`;
}

// Best-effort — a failed receipt email should never block or roll back a
// coin credit that already happened, so callers should not await this on
// the critical path (fire-and-forget, errors are only logged).
export async function sendTopUpReceiptEmail({ to, name, amountGhs, coins }) {
  if (!to) return { sent: false, reason: 'no-recipient' };

  const greeting = name ? `Hi ${name},` : 'Hi,';
  const subject = `You just topped up ${coins.toLocaleString()} coins`;
  const text =
    `${greeting}\n\n` +
    `Your purchase of ${formatGhs(amountGhs)} for ${coins.toLocaleString()} coins in Kombat Hamster ` +
    `was successful and the coins have been added to your account.\n\n` +
    `This receipt was sent automatically to the email address you registered with.\n\n` +
    `— Kombat Hamster`;
  const html =
    `<p>${greeting}</p>` +
    `<p>Your purchase of <strong>${formatGhs(amountGhs)}</strong> for ` +
    `<strong>${coins.toLocaleString()} coins</strong> in Kombat Hamster was successful and the coins ` +
    `have been added to your account.</p>` +
    `<p style="color:#85827d;font-size:12px;">This receipt was sent automatically to the email address you registered with.</p>` +
    `<p>— Kombat Hamster</p>`;

  if (!emailConfigured()) {
    console.log(`[email][DEMO] Would send receipt to ${to}: "${subject}"`);
    return { sent: false, demo: true };
  }

  try {
    await getTransporter().sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error(`[email] Failed to send receipt to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}

// Sends the "reset your password" link. Same DEMO-mode fallback as the
// receipt email above: without SMTP configured, this just logs the link to
// the console so local/dev setups can still test the flow end to end.
export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!to) return { sent: false, reason: 'no-recipient' };

  const greeting = name ? `Hi ${name},` : 'Hi,';
  const subject = 'Reset your Kombat Hamster password';
  const text =
    `${greeting}\n\n` +
    `We got a request to reset your Kombat Hamster password. Open this link to choose a new one ` +
    `(it expires in 30 minutes):\n\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.\n\n` +
    `— Kombat Hamster`;
  const html =
    `<p>${greeting}</p>` +
    `<p>We got a request to reset your Kombat Hamster password. Click below to choose a new one ` +
    `(this link expires in 30 minutes):</p>` +
    `<p><a href="${resetUrl}">Reset your password</a></p>` +
    `<p style="color:#85827d;font-size:12px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>` +
    `<p>— Kombat Hamster</p>`;

  if (!emailConfigured()) {
    console.log(`[email][DEMO] Would send password reset to ${to}: ${resetUrl}`);
    return { sent: false, demo: true };
  }

  try {
    await getTransporter().sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error(`[email] Failed to send password reset to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}
