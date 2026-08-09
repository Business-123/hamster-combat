import crypto from 'crypto';

// This game no longer talks to Paystack directly. Instead it talks to your
// central Payment Hub (a separate service), which is the only thing that
// holds the real Paystack secret key. See payment-hub's README for how to
// deploy the hub and register this game as one of its merchant sites.
const HUB_URL = (process.env.HUB_URL || '').replace(/\/+$/, '');
const HUB_API_KEY = process.env.HUB_API_KEY || '';
const HUB_API_SECRET = process.env.HUB_API_SECRET || '';

export function hubConfigured() {
  return Boolean(HUB_URL && HUB_API_KEY && HUB_API_SECRET);
}

function requireConfig() {
  if (!hubConfigured()) {
    throw new Error('HUB_URL, HUB_API_KEY and HUB_API_SECRET must all be set to accept real payments.');
  }
}

function sign(rawBody) {
  return crypto.createHmac('sha512', HUB_API_SECRET).update(rawBody).digest('hex');
}

// Starts a transaction on the hub, which starts it on Paystack, and returns
// the checkout URL to redirect the customer's browser to. `redirectUrl` is
// the page on THIS site the hub sends the browser back to once payment is
// done (the hub appends ?reference=...&status=... to it).
export async function initializeTransaction({ email, amountGhs, redirectUrl, metadata }) {
  requireConfig();
  const body = JSON.stringify({
    email,
    amount: amountGhs, // hub expects the major currency unit (GHS cedis), not pesewas
    currency: 'GHS',
    redirectUrl,
    metadata,
  });
  const res = await fetch(`${HUB_URL}/api/v1/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': HUB_API_KEY,
      'x-signature': sign(body),
    },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(data.message || 'Failed to initialize payment with the hub');
  }
  return data.data; // { reference, authorizationUrl }
}

// Asks the hub whether a transaction actually succeeded. The hub itself
// re-checks with Paystack, so this is safe to trust — never trust a
// client-reported "success" directly.
export async function verifyTransaction(reference) {
  requireConfig();
  // Signature is computed over an empty body for GET requests, per the hub's contract.
  const res = await fetch(`${HUB_URL}/api/v1/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      'x-api-key': HUB_API_KEY,
      'x-signature': sign(''),
    },
  });
  const data = await res.json();
  if (!res.ok || !data.status) {
    throw new Error(data.message || 'Failed to verify payment with the hub');
  }
  return data.data; // { reference, status, amount, currency, email, paidAt }
}

// Confirms a completion webhook actually came from the hub (HMAC over the raw
// request body, using this site's own api secret) — this is the same
// x-hub-signature scheme the hub documents for merchant sites.
export function verifyHubWebhookSignature(rawBody, signatureHeader) {
  if (!rawBody || !signatureHeader || !HUB_API_SECRET) return false;
  const expected = sign(rawBody);
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
