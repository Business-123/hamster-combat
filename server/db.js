import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DATA_DIR = path.join(__dirname, '..', 'data');

// Prefer a mounted volume at /data (set this up as a Railway volume so game
// state survives redeploys — without it, db.json lives inside the container
// filesystem and is wiped every deploy). Falls back to a local ./data folder
// automatically if /data isn't writable (e.g. running locally without a
// volume), so local dev needs no extra setup.
const DATA_DIR = process.env.DATA_DIR || '/data';

function resolveDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    return DATA_DIR;
  } catch (err) {
    if (DATA_DIR !== LOCAL_DATA_DIR) {
      console.warn(`[db] ${DATA_DIR} isn't writable (${err.code || err.message}) — falling back to ${LOCAL_DATA_DIR}. Mount a volume at ${DATA_DIR} in production so data persists across deploys.`);
    }
    return LOCAL_DATA_DIR;
  }
}

const DB_PATH = path.join(resolveDataDir(), 'db.json');

let cache = null;
let writeTimer = null;

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, accounts: {}, sessions: {} }, null, 2));
  }
}

function load() {
  if (cache) return cache;
  ensureDbFile();
  try {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (err) {
    console.error('Failed to read db.json, starting fresh:', err.message);
    cache = { users: {} };
  }
  // Backfill for db.json files written before accounts/sessions existed.
  if (!cache.accounts) cache.accounts = {};
  if (!cache.sessions) cache.sessions = {};
  return cache;
}

function scheduleSave() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
    } catch (err) {
      console.error('Failed to write db.json:', err.message);
    }
  }, 250); // debounce rapid writes (e.g. many taps in a row)
}

export function getUser(userId) {
  const db = load();
  return db.users[userId] || null;
}

export function findUserByReferralCode(code) {
  const db = load();
  return Object.values(db.users).find((u) => u.referralCode === code) || null;
}

export function saveUser(userId, userState) {
  const db = load();
  db.users[userId] = userState;
  scheduleSave();
  return userState;
}

// Permanently removes a player: their game state, their email/password
// account (if any), and any active login sessions (so a logged-in device is
// booted immediately rather than continuing to work against deleted data).
// Withdrawal records are deliberately left alone — they're a financial
// audit trail of money that already moved, not part of the live account.
export function deleteUser(userId) {
  const db = load();
  const existed = Boolean(db.users[userId]);
  delete db.users[userId];

  for (const [key, acc] of Object.entries(db.accounts || {})) {
    if (acc.userId === userId) delete db.accounts[key];
  }
  for (const [token, session] of Object.entries(db.sessions || {})) {
    if (session.userId === userId) delete db.sessions[token];
  }

  scheduleSave();
  return existed;
}

// --- Settings: admin-editable game config (mining rate, character prices/
// images, coin purchase rate, min withdrawal, tasks, bonuses). See
// server/settings.js, which owns defaults/validation/merging — this is just
// the raw persistence, mirroring every other section in this file.
export function getRawSettings() {
  const db = load();
  return db.settings || null;
}

export function saveSettings(settings) {
  const db = load();
  db.settings = settings;
  scheduleSave();
  return settings;
}

// --- Paystack payment references, so a reference can only ever be credited once ---
export function isPaymentProcessed(reference) {
  const db = load();
  return Boolean(db.processedPayments?.[reference]);
}

export function markPaymentProcessed(reference, info) {
  const db = load();
  if (!db.processedPayments) db.processedPayments = {};
  db.processedPayments[reference] = info;
  scheduleSave();
}

// --- Accounts (email + password login) ---
// Keyed by lower-cased email so lookups are case-insensitive.
export function getAccountByEmail(email) {
  const db = load();
  return db.accounts[String(email).trim().toLowerCase()] || null;
}

// True if this userId already belongs to some account (used to stop a guest
// id that's already claimed from being silently re-claimed by a new signup).
export function isUserIdClaimed(userId) {
  const db = load();
  return Object.values(db.accounts).some((a) => a.userId === userId);
}

// Used to look up the account (email/name/etc) behind a bare userId — e.g. so
// the wallet top-up flow can email the address the player actually registered
// with, even though it's only authenticated via x-user-id, not a bearer session.
export function getAccountByUserId(userId) {
  const db = load();
  return Object.values(db.accounts).find((a) => a.userId === userId) || null;
}

export function createAccount(email, userId, passwordHash, profile = {}) {
  const db = load();
  const key = String(email).trim().toLowerCase();
  const account = {
    email: String(email).trim(),
    userId,
    passwordHash,
    name: String(profile.name || '').trim(),
    phone: String(profile.phone || '').trim(),
    createdAt: Date.now(),
  };
  db.accounts[key] = account;
  scheduleSave();
  return account;
}

// Overwrites the stored hash for an existing account — used by both the
// self-service "forgot password" flow and the admin "reset password" action.
// Never touches sessions, so any device the player is already logged in on
// stays logged in; only the password itself changes.
export function updateAccountPassword(email, passwordHash) {
  const db = load();
  const key = String(email).trim().toLowerCase();
  if (!db.accounts[key]) return null;
  db.accounts[key].passwordHash = passwordHash;
  scheduleSave();
  return db.accounts[key];
}

// --- Password reset tokens ---
// Short-lived, single-use tokens keyed by the random token string itself
// (not the email), so a token grants "reset this one account's password"
// and nothing else. Cleared on use or expiry.
export function createPasswordResetToken(email, token, expiresAt) {
  const db = load();
  if (!db.resetTokens) db.resetTokens = {};
  db.resetTokens[token] = { email: String(email).trim().toLowerCase(), expiresAt };
  scheduleSave();
  return db.resetTokens[token];
}

export function getPasswordResetToken(token) {
  const db = load();
  return db.resetTokens?.[token] || null;
}

export function deletePasswordResetToken(token) {
  const db = load();
  if (db.resetTokens?.[token]) {
    delete db.resetTokens[token];
    scheduleSave();
  }
}

// --- Sessions (bearer tokens issued on login/signup) ---
export function createSession(token, userId, email, name) {
  const db = load();
  db.sessions[token] = { userId, email, name: name || '', createdAt: Date.now() };
  scheduleSave();
  return db.sessions[token];
}

export function getSession(token) {
  const db = load();
  return db.sessions[token] || null;
}

export function deleteSession(token) {
  const db = load();
  if (db.sessions[token]) {
    delete db.sessions[token];
    scheduleSave();
  }
}

// --- Withdrawals: admin-reviewed cash-out requests ---
// Keyed by id (shared with the matching entry in a user's transactions list
// so the two stay in sync). The admin reviews these out-of-band (sends the
// payout manually, e.g. via mobile money) and then calls the approve/reject
// endpoint to finalize it.
export function createWithdrawal(record) {
  const db = load();
  if (!db.withdrawals) db.withdrawals = {};
  db.withdrawals[record.id] = record;
  scheduleSave();
  return record;
}

export function getWithdrawal(id) {
  const db = load();
  return db.withdrawals?.[id] || null;
}

export function listWithdrawals(status) {
  const db = load();
  const all = Object.values(db.withdrawals || {});
  const filtered = status ? all.filter((w) => w.status === status) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function updateWithdrawal(id, patch) {
  const db = load();
  if (!db.withdrawals?.[id]) return null;
  db.withdrawals[id] = { ...db.withdrawals[id], ...patch };
  scheduleSave();
  return db.withdrawals[id];
}

// --- Admin: read-only views over the whole user base ---
// Joins each game-state record with its account (if any), so the admin
// portal can show an email/name next to guests that never signed up too.
export function listAllUsers() {
  const db = load();
  const accountsByUserId = {};
  for (const acc of Object.values(db.accounts || {})) {
    accountsByUserId[acc.userId] = acc;
  }
  return Object.entries(db.users || {}).map(([userId, u]) => {
    const acc = accountsByUserId[userId];
    return {
      userId,
      email: acc?.email || null,
      name: acc?.name || null,
      phone: acc?.phone || null,
      points: u.points || 0,
      profitPerHour: u.profitPerHour || 0,
      charactersOwned: (u.ownedCharacters || []).length,
      referralCount: (u.referrals || []).length,
      referredBy: u.referredBy || null,
      createdAt: acc?.createdAt || null,
      blocked: !!u.blocked,
      blockedReason: u.blockedReason || null,
    };
  });
}

// Aggregate counters for the admin dashboard's overview tab.
export function getStats() {
  const db = load();
  const users = Object.values(db.users || {});
  const withdrawals = Object.values(db.withdrawals || {});
  const pending = withdrawals.filter((w) => w.status === 'pending');
  const paid = withdrawals.filter((w) => w.status === 'paid');
  const rejected = withdrawals.filter((w) => w.status === 'rejected');
  return {
    totalUsers: users.length,
    totalAccounts: Object.keys(db.accounts || {}).length,
    totalCoinsInCirculation: users.reduce((sum, u) => sum + (u.points || 0), 0),
    usersWithCharacter: users.filter((u) => (u.ownedCharacters || []).length > 0).length,
    withdrawals: {
      pending: { count: pending.length, amountGhs: pending.reduce((s, w) => s + (w.amountGhs || 0), 0) },
      paid: { count: paid.length, amountGhs: paid.reduce((s, w) => s + (w.amountGhs || 0), 0) },
      rejected: { count: rejected.length, amountGhs: rejected.reduce((s, w) => s + (w.amountGhs || 0), 0) },
    },
  };
}

// Flush any pending write immediately (used on graceful shutdown)
export function flush() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (cache) {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
    } catch (err) {
      console.error('Failed to flush db.json:', err.message);
    }
  }
}
