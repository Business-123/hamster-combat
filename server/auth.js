import crypto from 'crypto';

// Passwords are hashed with scrypt (built into Node, no extra dependency)
// using a random per-account salt. Stored as "salt:hash" (both hex).
const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  let candidate;
  try {
    candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim()) && email.trim().length <= 254;
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

export function isValidName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 80;
}

// Loose on purpose — phone formats vary a lot by country and this field is
// optional, so we just guard against junk rather than enforcing one format.
const PHONE_RE = /^[+\d][\d\s-]{5,19}$/;

export function isValidPhone(phone) {
  if (phone === undefined || phone === null || phone === '') return true; // optional
  return typeof phone === 'string' && PHONE_RE.test(phone.trim());
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Same shape as a session token (32 random bytes), but kept as a separate
// export so call sites make it obvious they're minting a one-time,
// short-lived password-reset token rather than a login session.
export function newResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Used by the admin "reset password" action to generate a temporary
// password to hand back to the admin once — never stored anywhere in
// plaintext, only its hash (via hashPassword) is persisted.
export function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 chars, URL-safe
}
