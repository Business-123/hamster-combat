import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  getUser, saveUser, deleteUser, flush, findUserByReferralCode, isPaymentProcessed, markPaymentProcessed,
  getAccountByEmail, getAccountByUserId, createAccount, isUserIdClaimed, createSession, getSession, deleteSession,
  createWithdrawal, getWithdrawal, listWithdrawals, updateWithdrawal,
  listAllUsers, getStats,
  updateAccountPassword, createPasswordResetToken, getPasswordResetToken, deletePasswordResetToken,
} from './db.js';
import {
  defaultUser, applyAccrual, publicState, pointsPerTap, effectivePointsPerTap,
  DAILY_TARGET_HOUR, dailyBonusAmount, currentWindowStart,
  getTasks, referralBonusReferrer, referralBonusReferee, getCharacters,
  effectiveProfitPerHour, REDEEM_TASK_ID, hasAnyCharacter, coinsForGhs,
  addTransaction, updateTransactionStatus, minWithdrawalGhs, taskVerifyCostGhs,
  characterPurchaseCostGhs,
  allTasksCompleted, outstandingTaskIds,
  evaluateTapBatch, clearBlock, unblockPriceGhs,
} from './game.js';
import { hubConfigured, initializeTransaction, verifyTransaction, verifyHubWebhookSignature } from './paymentHub.js';
import { hashPassword, verifyPassword, isValidEmail, isValidPassword, isValidName, isValidPhone, newSessionToken, newResetToken, generateTempPassword } from './auth.js';
import { sendTopUpReceiptEmail, sendPasswordResetEmail } from './email.js';
import {
  getSettings, updateGeneralSettings,
  upsertCharacter, deleteCharacter,
  upsertTask, deleteTask,
} from './settings.js';

// Coin top-ups go through the central Payment Hub (a separate service that's
// the only thing holding a real Paystack secret key) instead of talking to
// Paystack directly. Set HUB_URL / HUB_API_KEY / HUB_API_SECRET to the values
// you get from registering this game as a merchant site on your hub — see
// payment-hub's README, section "Register your websites". With them unset,
// top-ups fall back to trusting the client-reported amount so the flow still
// works locally without a live hub.
if (!hubConfigured()) {
  console.warn('[wallet] HUB_URL/HUB_API_KEY/HUB_API_SECRET not set — running coin top-ups in DEMO mode (payments are not verified server-side).');
}
// The public URL of THIS game, used to build the redirectUrl the hub sends
// the customer's browser back to after checkout.
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || '').replace(/\/+$/, '');

// --- Admin: reviews and settles withdrawal requests ---
// Set ADMIN_API_KEY and send it as the `x-admin-key` header (public/admin.html
// does this after you paste the key in once). Left unset, all admin routes
// are disabled — there's no default key.
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
if (!ADMIN_API_KEY) {
  console.warn('[admin] ADMIN_API_KEY not set — /api/admin/* routes are disabled until you set one.');
}
function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key') || '';
  if (!ADMIN_API_KEY || key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Not authorized' });
  }
  next();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
// Capture the raw body alongside the parsed one — verifying the hub's webhook
// signature needs the exact raw bytes that were sent, not a re-serialized copy.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// Identify the caller via an x-user-id header. The frontend generates and
// persists this id in localStorage on first load.
function requireUserId(req, res, next) {
  const userId = req.header('x-user-id');
  if (!userId) {
    return res.status(400).json({ error: 'Missing x-user-id header' });
  }
  req.userId = userId;
  next();
}

function loadAccruedUser(userId) {
  const existing = getUser(userId) || defaultUser(userId);
  return applyAccrual(existing);
}

// Shared 423 ("Locked") response for every points-earning route once an
// account has been blocked for tapping faster than humanly possible (see
// game.js's evaluateTapBatch). The player can clear it via the
// /api/unblock/* flow below by paying unblockPriceGhs().
const BLOCKED_MESSAGE = 'Your account is blocked for tapping faster than humanly possible. Pay the unblock fee in the Wallet tab to keep earning.';
function sendBlocked(req, res, user) {
  saveUser(req.userId, user);
  return res.status(423).json({ error: BLOCKED_MESSAGE, blocked: true, state: publicState(user) });
}

// Identify the caller via a signed-in session's bearer token.
function requireAuth(req, res, next) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Your session has expired — please log in again' });
  }
  req.userId = session.userId;
  req.userEmail = session.email;
  req.userName = session.name || '';
  next();
}

// --- Auth: email + password accounts ---
// A session token (bearer) maps to the same userId/game-state used by the
// rest of the API, so every existing /api/... route keeps working unchanged
// once the frontend stores the returned userId.

app.post('/api/auth/signup', (req, res) => {
  const { email, password, name, phone, guestUserId } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!isValidName(name)) {
    return res.status(400).json({ error: 'Enter your full name (2-80 characters)' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Enter a valid phone number, or leave it blank' });
  }
  if (getAccountByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  // If the browser already has an (anonymous) guest save, adopt it into the
  // new account instead of starting over — but only if nobody else has
  // already claimed that id.
  let userId = null;
  if (typeof guestUserId === 'string' && guestUserId && getUser(guestUserId) && !isUserIdClaimed(guestUserId)) {
    userId = guestUserId;
  } else {
    userId = randomUUID();
  }

  let user = getUser(userId);
  if (!user) {
    user = defaultUser(userId);
    saveUser(userId, user);
  }

  const trimmedName = name.trim();
  createAccount(email, userId, hashPassword(password), { name: trimmedName, phone });
  const token = newSessionToken();
  createSession(token, userId, email.trim().toLowerCase(), trimmedName);
  res.json({ token, email: email.trim(), name: trimmedName, state: publicState(applyAccrual(user)) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Enter your email and password' });
  }
  const account = getAccountByEmail(email);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const token = newSessionToken();
  createSession(token, account.userId, account.email, account.name);
  const user = loadAccruedUser(account.userId);
  saveUser(account.userId, user);
  res.json({ token, email: account.email, name: account.name || '', state: publicState(user) });
});

// Reset tokens expire quickly since they're emailed in plaintext — a short
// window limits how long a leaked/intercepted link stays useful.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Always responds the same way whether or not the email belongs to an
// account, and never reveals which — otherwise this endpoint could be used
// to check which addresses have accounts (an enumeration leak).
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (isValidEmail(email)) {
    const account = getAccountByEmail(email);
    if (account) {
      const token = newResetToken();
      createPasswordResetToken(account.email, token, Date.now() + RESET_TOKEN_TTL_MS);
      const resetUrl = `${APP_PUBLIC_URL || ''}/?resetToken=${token}`;
      // Fire-and-forget, same as the top-up receipt email — a slow/failed
      // send shouldn't hold up or fail this response.
      sendPasswordResetEmail({ to: account.email, name: account.name, resetUrl }).catch(() => {});
    }
  }
  res.json({ ok: true });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Missing or invalid reset link' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const record = getPasswordResetToken(token);
  if (!record || record.expiresAt < Date.now()) {
    deletePasswordResetToken(token);
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }
  const account = getAccountByEmail(record.email);
  if (!account) {
    deletePasswordResetToken(token);
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }
  updateAccountPassword(record.email, hashPassword(password));
  // Single-use — burn the token immediately so it can't be replayed.
  deletePasswordResetToken(token);
  res.json({ ok: true });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const header = req.header('authorization') || '';
  const token = header.slice(7).trim();
  deleteSession(token);
  res.json({ ok: true });
});

// Called on app load to silently restore a session from a stored token.
app.get('/api/auth/session', requireAuth, (req, res) => {
  const user = loadAccruedUser(req.userId);
  saveUser(req.userId, user);
  res.json({ email: req.userEmail, name: req.userName, state: publicState(user) });
});

// Issue a fresh user id (used by the frontend on first ever load).
app.post('/api/users', (req, res) => {
  const userId = randomUUID();
  const user = defaultUser(userId);
  saveUser(userId, user);
  res.json(publicState(user));
});

// Fetch current state (also applies any offline passive-income accrual).
app.get('/api/state', requireUserId, (req, res) => {
  const user = loadAccruedUser(req.userId);
  saveUser(req.userId, user);
  res.json(publicState(user));
});

// Register one or more taps on the coin.
app.post('/api/tap', requireUserId, (req, res) => {
  let user = loadAccruedUser(req.userId);
  if (user.blocked) {
    return sendBlocked(req, res, user);
  }
  if (!hasAnyCharacter(user)) {
    saveUser(req.userId, user);
    return res.status(403).json({ error: 'Get your first character to start earning coins', state: publicState(user) });
  }
  const count = Math.max(1, Math.min(50, Number(req.body?.count) || 1));
  // Anti-autoclicker: check this batch's implied taps/sec against the
  // admin-configured human ceiling before crediting anything. A batch that's
  // too fast never earns points — it only ever adds a strike (or blocks).
  user = evaluateTapBatch(user, count, Date.now());
  if (user.blocked) {
    return sendBlocked(req, res, user);
  }
  user = { ...user, points: user.points + count * effectivePointsPerTap(user.selectedCharacterId ?? null) };
  saveUser(req.userId, user);
  res.json(publicState(user));
});

// Claim a daily bonus: 'reward' | 'cipher' | 'combo'.
app.post('/api/claim/:type', requireUserId, (req, res) => {
  const { type } = req.params;
  if (!Object.prototype.hasOwnProperty.call(DAILY_TARGET_HOUR, type)) {
    return res.status(400).json({ error: 'Unknown bonus type' });
  }
  let user = loadAccruedUser(req.userId);
  if (user.blocked) {
    return sendBlocked(req, res, user);
  }
  if (!hasAnyCharacter(user)) {
    saveUser(req.userId, user);
    return res.status(403).json({ error: 'Get your first character to start earning coins', state: publicState(user) });
  }
  const windowStart = currentWindowStart(DAILY_TARGET_HOUR[type]);
  const alreadyClaimed = (user.lastClaimed?.[type] ?? 0) >= windowStart;
  if (alreadyClaimed) {
    return res.status(409).json({ error: 'Already claimed for this window', state: publicState(user) });
  }
  const bonus = dailyBonusAmount()[type];
  user = {
    ...user,
    points: user.points + bonus,
    lastClaimed: { ...user.lastClaimed, [type]: Date.now() },
  };
  const DAILY_LABEL = { reward: 'Daily reward', cipher: 'Daily cipher', combo: 'Daily combo' };
  user = addTransaction(user, { type: 'daily', title: DAILY_LABEL[type] || 'Daily bonus', coins: bonus });
  saveUser(req.userId, user);
  res.json({ bonus, state: publicState(user) });
});

// --- Wallet: buy coins with real money via the Payment Hub (1,000 coins = 1 GHS) ---

// Step 1: ask the hub to start a Paystack checkout and hand back the URL to
// send the customer's browser to. The hub — not this server, and never the
// browser — holds the Paystack secret key.
app.post('/api/wallet/topup/initialize', requireUserId, async (req, res) => {
  const { amountGhs, email: submittedEmail } = req.body || {};
  const amount = Number(amountGhs);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  // Registered users always get the receipt at the email they signed up
  // with — never a client-supplied one — so a purchase can't accidentally
  // email a different address than the account it belongs to. Guests (no
  // account yet) still need to type one in, just for the Paystack receipt.
  const account = getAccountByUserId(req.userId);
  const email = account ? account.email : submittedEmail;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required for the receipt' });
  }

  if (!hubConfigured()) {
    // DEMO mode: skip the hub/Paystack entirely and credit immediately, purely
    // so the flow is testable without live hub credentials.
    const coins = coinsForGhs(amount);
    let user = loadAccruedUser(req.userId);
    user = { ...user, points: user.points + coins };
    user = addTransaction(user, { type: 'topup', title: `Top-up (demo)`, coins, amountGhs: amount });
    saveUser(req.userId, user);
    // Fire-and-forget: never let a receipt email failure block the credit
    // that already happened.
    sendTopUpReceiptEmail({ to: email, name: account?.name, amountGhs: amount, coins }).catch(() => {});
    return res.json({ authorizationUrl: null, reference: null, demo: true, coins, state: publicState(user) });
  }

  if (!APP_PUBLIC_URL) {
    return res.status(500).json({ error: 'Server misconfigured: APP_PUBLIC_URL is not set' });
  }

  try {
    const redirectUrl = `${APP_PUBLIC_URL}/`;
    const { reference, authorizationUrl } = await initializeTransaction({
      email,
      amountGhs: amount,
      redirectUrl,
      metadata: { userId: req.userId, amountGhs: amount },
    });
    res.json({ authorizationUrl, reference });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not start payment' });
  }
});

// Step 2: once the hub redirects the browser back here with ?reference=...,
// the frontend calls this to confirm the payment and credit coins. We always
// re-verify against the hub (which re-verifies against Paystack) rather than
// trusting the redirect — a customer could land on this URL without paying.
app.post('/api/wallet/topup/verify', requireUserId, async (req, res) => {
  const { reference } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'Missing payment reference' });
  }
  if (isPaymentProcessed(reference)) {
    const user = loadAccruedUser(req.userId);
    saveUser(req.userId, user);
    return res.json({ credited: 0, alreadyCredited: true, state: publicState(user) });
  }

  try {
    const txn = await verifyTransaction(reference);
    if (txn.status !== 'SUCCESS') {
      return res.status(402).json({ error: `Payment status: ${txn.status}` });
    }
    if (String(txn.currency || '').toUpperCase() !== 'GHS') {
      return res.status(400).json({ error: 'Unexpected payment currency' });
    }
    const coins = coinsForGhs(txn.amount);
    let user = loadAccruedUser(req.userId);
    user = { ...user, points: user.points + coins };
    user = addTransaction(user, { type: 'topup', title: 'Top-up', coins, amountGhs: txn.amount });
    saveUser(req.userId, user);
    markPaymentProcessed(reference, { userId: req.userId, amountGhs: txn.amount, coins, at: Date.now() });
    const account = getAccountByUserId(req.userId);
    const receiptEmail = account ? account.email : txn.email;
    sendTopUpReceiptEmail({ to: receiptEmail, name: account?.name, amountGhs: txn.amount, coins }).catch(() => {});
    res.json({ credited: coins, alreadyCredited: false, state: publicState(user) });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not verify this payment yet — try again shortly' });
  }
});

// --- Wallet: pay to clear an autoclicker block ---
// Same Payment-Hub-hosted Paystack checkout pattern as the top-up/task
// verification flows above. The fee is admin-editable (server/settings.js
// unblockPriceGhs, GH₵0.01 by default) via PUT /api/admin/settings.

// Step 1: start a hub checkout for unblockPriceGhs(). Only blocked accounts
// can start this — nothing to unblock otherwise.
app.post('/api/unblock/initialize', requireUserId, async (req, res) => {
  let user = loadAccruedUser(req.userId);
  if (!user.blocked) {
    saveUser(req.userId, user);
    return res.status(400).json({ error: 'Your account is not blocked', state: publicState(user) });
  }

  const costGhs = unblockPriceGhs();
  const { email: submittedEmail } = req.body || {};
  const account = getAccountByUserId(req.userId);
  const email = account ? account.email : submittedEmail;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    saveUser(req.userId, user);
    return res.status(400).json({ error: 'A valid email is required to pay the unblock fee' });
  }

  if (!hubConfigured()) {
    // DEMO mode: skip the hub/Paystack entirely and unblock immediately,
    // purely so the flow is testable without live hub credentials.
    user = clearBlock(user);
    user = addTransaction(user, { type: 'unblock', title: 'Account unblock fee (demo)', coins: 0, amountGhs: costGhs });
    saveUser(req.userId, user);
    return res.json({ authorizationUrl: null, reference: null, demo: true, state: publicState(user) });
  }

  saveUser(req.userId, user);
  if (!APP_PUBLIC_URL) {
    return res.status(500).json({ error: 'Server misconfigured: APP_PUBLIC_URL is not set' });
  }

  try {
    const redirectUrl = `${APP_PUBLIC_URL}/?unblock=1`;
    const { reference, authorizationUrl } = await initializeTransaction({
      email,
      amountGhs: costGhs,
      redirectUrl,
      metadata: { userId: req.userId, purpose: 'unblock' },
    });
    res.json({ authorizationUrl, reference });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not start the unblock payment' });
  }
});

// Step 2: once the hub redirects back with ?reference=..., confirm and
// clear the block. Always re-verified against the hub/Paystack — never
// trust the redirect alone.
app.post('/api/unblock/confirm', requireUserId, async (req, res) => {
  const { reference } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'Missing payment reference' });
  }
  if (isPaymentProcessed(reference)) {
    const user = loadAccruedUser(req.userId);
    saveUser(req.userId, user);
    return res.json({ unblocked: !user.blocked, alreadyProcessed: true, state: publicState(user) });
  }

  try {
    const txn = await verifyTransaction(reference);
    if (txn.status !== 'SUCCESS') {
      return res.status(402).json({ error: `Payment status: ${txn.status}` });
    }
    if (String(txn.currency || '').toUpperCase() !== 'GHS') {
      return res.status(400).json({ error: 'Unexpected payment currency' });
    }
    let user = loadAccruedUser(req.userId);
    const wasBlocked = user.blocked;
    user = clearBlock(user);
    if (wasBlocked) {
      user = addTransaction(user, { type: 'unblock', title: 'Account unblock fee', coins: 0, amountGhs: txn.amount });
    }
    saveUser(req.userId, user);
    markPaymentProcessed(reference, { userId: req.userId, purpose: 'unblock', amountGhs: txn.amount, at: Date.now() });
    res.json({ unblocked: true, state: publicState(user) });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not verify this payment yet — try again shortly' });
  }
});

// Step 3 (belt-and-braces): the hub also proactively POSTs a signed
// completion webhook here as soon as Paystack confirms payment, in case the
// customer never makes it back to step 2 (closed the tab, flaky network,
// etc). Idempotent with step 2 via isPaymentProcessed/markPaymentProcessed.
app.post('/webhooks/hub', (req, res) => {
  const signature = req.header('x-hub-signature');
  if (!verifyHubWebhookSignature(req.rawBody || '', signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  res.status(200).json({ status: true }); // acknowledge fast, do the work after

  const event = req.body || {};
  if (event.event !== 'transaction.completed' || event.status !== 'SUCCESS') return;
  const { reference, amount, currency, metadata } = event;
  const userId = metadata?.userId;
  if (!reference || !userId) return;
  if (isPaymentProcessed(reference)) return;
  if (String(currency || '').toUpperCase() !== 'GHS') return;

  // Unblock-fee payments carry purpose: 'unblock' in metadata — clear the
  // block instead of the usual coins-per-GHS top-up.
  if (metadata?.purpose === 'unblock') {
    let user = loadAccruedUser(userId);
    const wasBlocked = user.blocked;
    user = clearBlock(user);
    if (wasBlocked) {
      user = addTransaction(user, { type: 'unblock', title: 'Account unblock fee', coins: 0, amountGhs: amount });
    }
    saveUser(userId, user);
    markPaymentProcessed(reference, { userId, purpose: 'unblock', amountGhs: amount, at: Date.now(), via: 'webhook' });
    return;
  }

  // Task-verification payments carry a taskId in metadata — complete the
  // task and credit its coin reward instead of the usual coins-per-GHS top-up.
  if (metadata?.taskId) {
    const task = getTasks().find((t) => t.id === metadata.taskId);
    if (!task) return;
    let user = loadAccruedUser(userId);
    const completed = new Set(user.completedTasks ?? []);
    let bonus = 0;
    if (!completed.has(task.id)) {
      completed.add(task.id);
      bonus = task.reward;
      user = { ...user, points: user.points + bonus, completedTasks: Array.from(completed) };
      user = addTransaction(user, { type: 'task', title: task.title, coins: bonus });
    }
    saveUser(userId, user);
    markPaymentProcessed(reference, { userId, taskId: task.id, amountGhs: amount, at: Date.now(), via: 'webhook' });
    return;
  }

  // Character-purchase payments carry a characterId in metadata — grant the
  // character instead of the usual coins-per-GHS top-up.
  if (metadata?.characterId) {
    const character = getCharacters().find((c) => c.id === metadata.characterId);
    if (!character) return;
    let user = loadAccruedUser(userId);
    user = grantCharacterPurchase(user, character, amount);
    saveUser(userId, user);
    markPaymentProcessed(reference, { userId, characterId: character.id, amountGhs: amount, at: Date.now(), via: 'webhook' });
    return;
  }

  const coins = coinsForGhs(amount);
  let user = loadAccruedUser(userId);
  user = { ...user, points: user.points + coins };
  user = addTransaction(user, { type: 'topup', title: 'Top-up', coins, amountGhs: amount });
  saveUser(userId, user);
  markPaymentProcessed(reference, { userId, amountGhs: amount, coins, at: Date.now(), via: 'webhook' });
  const account = getAccountByUserId(userId);
  sendTopUpReceiptEmail({ to: account?.email, name: account?.name, amountGhs: amount, coins }).catch(() => {});
});

// --- Wallet: withdraw coins back to GHS ---
// Real request, manually settled: this debits the coin balance right away
// and files a 'pending' withdrawal for an admin to review. There is no
// automatic payout — an admin sends the money (e.g. mobile money transfer)
// outside this app, then approves the request via /api/admin/withdrawals or
// public/admin.html, which is what marks it paid on the user's side. If it's
// rejected instead, the coins are refunded automatically.
app.post('/api/wallet/withdraw', requireUserId, (req, res) => {
  const { amountGhs, destination } = req.body || {};
  const amount = Number(amountGhs);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (amount < minWithdrawalGhs()) {
    return res.status(400).json({ error: `Minimum withdrawal is GH₵${minWithdrawalGhs()}` });
  }
  const dest = String(destination || '').trim();
  if (!dest || dest.length < 6 || dest.length > 64) {
    return res.status(400).json({ error: 'Enter a valid mobile money number' });
  }

  const coins = coinsForGhs(amount);
  let user = loadAccruedUser(req.userId);

  // Gate: every task on the current roster must be completed before any
  // withdrawal request is accepted. Re-checked server-side on each attempt
  // (not just reflected in the UI) so this can't be bypassed by calling the
  // API directly.
  if (!allTasksCompleted(user)) {
    saveUser(req.userId, user);
    const remaining = outstandingTaskIds(user)
      .map((id) => getTasks().find((t) => t.id === id)?.title || id);
    return res.status(400).json({
      error: 'Complete all tasks in the Earn tab before withdrawing.',
      outstandingTasks: remaining,
      state: publicState(user),
    });
  }

  if (user.points < coins) {
    saveUser(req.userId, user);
    return res.status(400).json({ error: 'Not enough coins for this amount', state: publicState(user) });
  }

  const withdrawalId = randomUUID();
  user = { ...user, points: user.points - coins };
  user = addTransaction(user, {
    id: withdrawalId,
    type: 'withdrawal',
    title: `Withdrawal to ${dest}`,
    coins: -coins,
    amountGhs: amount,
    status: 'pending',
  });
  saveUser(req.userId, user);

  const account = getAccountByUserId(req.userId);
  createWithdrawal({
    id: withdrawalId,
    userId: req.userId,
    email: account?.email || null,
    name: account?.name || null,
    coins,
    amountGhs: amount,
    destination: dest,
    status: 'pending',
    createdAt: Date.now(),
  });

  res.json({
    message: 'Withdrawal request submitted. An admin will review it and send payment to your mobile money number.',
    state: publicState(user),
  });
});

// List withdrawal requests (optionally filtered by status: pending/paid/rejected).
app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json({ withdrawals: listWithdrawals(status) });
});

// Mark a pending request as paid — call this only after you've actually sent
// the money. This is what finalizes the debit on the user's side.
app.post('/api/admin/withdrawals/:id/approve', requireAdmin, (req, res) => {
  const withdrawal = getWithdrawal(req.params.id);
  if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
  if (withdrawal.status !== 'pending') {
    return res.status(409).json({ error: `Already ${withdrawal.status}` });
  }
  updateWithdrawal(withdrawal.id, { status: 'paid', paidAt: Date.now() });
  let user = loadAccruedUser(withdrawal.userId);
  user = updateTransactionStatus(user, withdrawal.id, 'completed');
  saveUser(withdrawal.userId, user);
  res.json({ ok: true });
});

// Reject a pending request — refunds the coins back to the user automatically.
app.post('/api/admin/withdrawals/:id/reject', requireAdmin, (req, res) => {
  const withdrawal = getWithdrawal(req.params.id);
  if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
  if (withdrawal.status !== 'pending') {
    return res.status(409).json({ error: `Already ${withdrawal.status}` });
  }
  const reason = String(req.body?.reason || '').trim();
  updateWithdrawal(withdrawal.id, { status: 'rejected', rejectedAt: Date.now(), reason: reason || null });
  let user = loadAccruedUser(withdrawal.userId);
  user = updateTransactionStatus(user, withdrawal.id, 'failed');
  user = { ...user, points: user.points + withdrawal.coins };
  user = addTransaction(user, {
    type: 'withdrawal',
    title: reason ? `Withdrawal rejected — ${reason}` : 'Withdrawal rejected — refunded',
    coins: withdrawal.coins,
    amountGhs: withdrawal.amountGhs,
    status: 'completed',
  });
  saveUser(withdrawal.userId, user);
  res.json({ ok: true });
});

// Dashboard totals: user counts, coins in circulation, withdrawal summary.
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json(getStats());
});

// --- Admin: game settings (mining rate, coin-purchase rate, min withdrawal,
// referral/daily bonuses, top-up presets, character roster, task roster).
// Everything here is read live by server/game.js on every request, so a
// save here takes effect immediately for every player — no redeploy needed.
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json(getSettings());
});

// Updates the single-value settings only (mining rate, exchange rate, min
// withdrawal, referral bonuses, daily bonus amounts, top-up presets).
// Characters and tasks have their own endpoints below since they're lists.
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const settings = updateGeneralSettings(req.body || {});
  res.json(settings);
});

// Create a new character (omit `id`) or update an existing one (include the
// matching `id`). Fields: name, rank, price, profitMultiplier, image
// (absolute URL, optional), gradient, glow.
app.post('/api/admin/characters', requireAdmin, (req, res) => {
  try {
    const characters = upsertCharacter(req.body || {});
    res.json({ characters });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save character' });
  }
});

app.delete('/api/admin/characters/:id', requireAdmin, (req, res) => {
  try {
    const characters = deleteCharacter(req.params.id);
    res.json({ characters });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not delete character' });
  }
});

// Create a new task (omit `id`) or update an existing one (include the
// matching `id`). Fields: title, reward, url (optional).
app.post('/api/admin/tasks', requireAdmin, (req, res) => {
  try {
    const tasks = upsertTask(req.body || {});
    res.json({ tasks });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save task' });
  }
});

app.delete('/api/admin/tasks/:id', requireAdmin, (req, res) => {
  const tasks = deleteTask(req.params.id);
  res.json({ tasks });
});

// List every user's game state joined with their account (if any), for the
// Users tab. Supports a simple `q` search over email/name/userId and sorts
// by coin balance (desc) by default.
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let users = listAllUsers();
  if (q) {
    users = users.filter((u) =>
      u.userId.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q)
    );
  }
  users.sort((a, b) => b.points - a.points);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  res.json({ total: users.length, users: users.slice(0, limit) });
});

// Manually credit a user: grant coins (any amount, added directly — no
// price/cost involved) and/or hand them any character for free (skips the
// price check and doesn't touch their coin balance). Either field is
// optional so an admin can do just one or both in a single call. Logged as
// transactions so it shows up in the player's history and the admin can see
// it was a manual grant, not something the player earned or bought.
app.post('/api/admin/users/:userId/credit', requireAdmin, (req, res) => {
  const { coins, characterId } = req.body || {};
  let user = getUser(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'Unknown user' });
  }
  user = applyAccrual(user);

  let grantedCoins = 0;
  if (coins !== undefined && coins !== null && coins !== '') {
    const amount = Math.round(Number(coins));
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: 'coins must be a non-zero number' });
    }
    grantedCoins = amount;
    user = { ...user, points: user.points + amount };
    user = addTransaction(user, { type: 'admin', title: 'Admin credit', coins: amount });
  }

  let grantedCharacter = null;
  if (characterId) {
    const character = getCharacters().find((c) => c.id === characterId);
    if (!character) {
      return res.status(404).json({ error: 'Unknown character' });
    }
    const owned = new Set(user.ownedCharacters ?? []);
    if (!owned.has(character.id)) {
      owned.add(character.id);
      const ownedCharacters = Array.from(owned);
      // Auto-equip if this is the user's first character, same as a normal
      // purchase, so earning switches on immediately.
      const selectedCharacterId = user.selectedCharacterId ?? character.id;
      user = {
        ...user,
        ownedCharacters,
        selectedCharacterId,
        profitPerHour: effectiveProfitPerHour(ownedCharacters, selectedCharacterId),
      };
      user = addTransaction(user, { type: 'admin', title: `Admin grant: ${character.name}`, coins: 0 });
      grantedCharacter = character.id;
    }
  }

  if (!grantedCoins && !grantedCharacter) {
    return res.status(400).json({ error: 'Nothing to grant — pass coins and/or characterId' });
  }

  saveUser(req.params.userId, user);
  res.json({ grantedCoins, grantedCharacter, state: publicState(user) });
});

// Manually clear an autoclicker block for free — for a player who was
// flagged by mistake, without making them pay the unblock fee.
app.post('/api/admin/users/:userId/unblock', requireAdmin, (req, res) => {
  let user = getUser(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'Unknown user' });
  }
  user = applyAccrual(user);
  user = clearBlock(user);
  user = addTransaction(user, { type: 'admin', title: 'Admin unblock (autoclicker flag cleared)', coins: 0 });
  saveUser(req.params.userId, user);
  res.json({ ok: true, state: publicState(user) });
});

// Force-reset a player's password. Passwords are only ever stored as an
// irreversible scrypt hash (see server/auth.js), so there's no way to look
// up or display someone's real password here — this is the admin-side
// equivalent: it issues a brand-new temporary password, hashes and stores
// that, and hands the plaintext back to the admin exactly once (it is never
// written to disk or logged). The admin is expected to relay it to the
// player, who should change it after logging in.
app.post('/api/admin/users/:userId/reset-password', requireAdmin, (req, res) => {
  const account = getAccountByUserId(req.params.userId);
  if (!account) {
    return res.status(404).json({ error: 'This player has no email/password account to reset (guest only)' });
  }
  const tempPassword = generateTempPassword();
  updateAccountPassword(account.email, hashPassword(tempPassword));
  res.json({ email: account.email, tempPassword });
});

// Permanently delete a player: their game state, account, and any active
// sessions. Irreversible — there's no undo/soft-delete, so the confirmation
// burden is on the admin UI (see public/admin.html).
app.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
  const existed = deleteUser(req.params.userId);
  if (!existed) {
    return res.status(404).json({ error: 'Unknown user' });
  }
  res.json({ ok: true });
});

// --- Earn tab: list tasks with per-user completion state ---
app.get('/api/tasks', requireUserId, (req, res) => {
  const user = loadAccruedUser(req.userId);
  saveUser(req.userId, user);
  const completed = new Set(user.completedTasks ?? []);
  res.json({
    tasks: getTasks().map((t) => ({ ...t, completed: completed.has(t.id) })),
  });
});

// Claim a task's reward (once per user). Tasks with a verifyCost can't be
// claimed here — they go through the /verify/initialize + /verify/confirm
// flow below instead, since they require a real-money payment first.
// REDEEM_TASK_ID also can't be claimed here — it only completes
// automatically as a side effect of the real action (redeeming a friend's
// code), so a player can't just tap "Go" on that row and collect the reward
// for free.
const AUTO_COMPLETE_TASK_IDS = new Set([REDEEM_TASK_ID]);
app.post('/api/tasks/:id/complete', requireUserId, (req, res) => {
  const task = getTasks().find((t) => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Unknown task' });
  }
  if (taskVerifyCostGhs(task) > 0) {
    return res.status(400).json({ error: 'This task requires payment verification — use the verify flow instead' });
  }
  if (AUTO_COMPLETE_TASK_IDS.has(task.id)) {
    return res.status(400).json({ error: 'This task completes automatically — it can\'t be claimed directly' });
  }
  let user = loadAccruedUser(req.userId);
  if (user.blocked) {
    return sendBlocked(req, res, user);
  }
  if (!hasAnyCharacter(user)) {
    saveUser(req.userId, user);
    return res.status(403).json({ error: 'Get your first character to start earning coins', state: publicState(user) });
  }
  const completed = new Set(user.completedTasks ?? []);
  if (completed.has(task.id)) {
    return res.status(409).json({ error: 'Task already completed', state: publicState(user) });
  }
  completed.add(task.id);
  user = { ...user, points: user.points + task.reward, completedTasks: Array.from(completed) };
  user = addTransaction(user, { type: 'task', title: task.title, coins: task.reward });
  saveUser(req.userId, user);
  res.json({ bonus: task.reward, state: publicState(user) });
});

// --- Verified tasks: reward requires a small real-money payment first ---
// Same Payment-Hub-hosted Paystack checkout pattern as the wallet top-up
// flow (server never sees the card, never sees a Paystack key), but on
// success it completes the task and credits its coin reward instead of
// crediting coins-per-GHS. The verification amount (task.verifyCost, in
// GHS) is admin-editable per task in public/admin.html.

// Step 1: start a hub checkout for this task's verifyCost.
app.post('/api/tasks/:id/verify/initialize', requireUserId, async (req, res) => {
  const task = getTasks().find((t) => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Unknown task' });
  }
  const costGhs = taskVerifyCostGhs(task);
  if (costGhs <= 0) {
    return res.status(400).json({ error: 'This task does not require verification' });
  }

  let user = loadAccruedUser(req.userId);
  if (user.blocked) {
    return sendBlocked(req, res, user);
  }
  if (!hasAnyCharacter(user)) {
    saveUser(req.userId, user);
    return res.status(403).json({ error: 'Get your first character to start earning coins', state: publicState(user) });
  }
  const completed = new Set(user.completedTasks ?? []);
  if (completed.has(task.id)) {
    saveUser(req.userId, user);
    return res.status(409).json({ error: 'Task already completed', state: publicState(user) });
  }

  const { email: submittedEmail } = req.body || {};
  const account = getAccountByUserId(req.userId);
  const email = account ? account.email : submittedEmail;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required to verify' });
  }

  if (!hubConfigured()) {
    // DEMO mode: skip the hub/Paystack entirely and complete the task
    // immediately, purely so the flow is testable without live hub credentials.
    completed.add(task.id);
    user = { ...user, points: user.points + task.reward, completedTasks: Array.from(completed) };
    user = addTransaction(user, { type: 'task', title: task.title, coins: task.reward });
    saveUser(req.userId, user);
    return res.json({ authorizationUrl: null, reference: null, demo: true, bonus: task.reward, state: publicState(user) });
  }

  if (!APP_PUBLIC_URL) {
    return res.status(500).json({ error: 'Server misconfigured: APP_PUBLIC_URL is not set' });
  }

  try {
    // Carry the task id through the redirect so the frontend knows which
    // task to confirm once the hub sends the browser back here.
    const redirectUrl = `${APP_PUBLIC_URL}/?taskId=${encodeURIComponent(task.id)}`;
    const { reference, authorizationUrl } = await initializeTransaction({
      email,
      amountGhs: costGhs,
      redirectUrl,
      metadata: { userId: req.userId, taskId: task.id },
    });
    res.json({ authorizationUrl, reference });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not start verification payment' });
  }
});

// Step 2: once the hub redirects back with ?reference=..., confirm and
// complete the task. Always re-verified against the hub/Paystack — never
// trust the redirect alone.
app.post('/api/tasks/:id/verify/confirm', requireUserId, async (req, res) => {
  const task = getTasks().find((t) => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Unknown task' });
  }
  const { reference } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'Missing payment reference' });
  }
  if (isPaymentProcessed(reference)) {
    const user = loadAccruedUser(req.userId);
    saveUser(req.userId, user);
    return res.json({ bonus: 0, alreadyCompleted: true, state: publicState(user) });
  }

  try {
    const txn = await verifyTransaction(reference);
    if (txn.status !== 'SUCCESS') {
      return res.status(402).json({ error: `Payment status: ${txn.status}` });
    }
    if (String(txn.currency || '').toUpperCase() !== 'GHS') {
      return res.status(400).json({ error: 'Unexpected payment currency' });
    }
    let user = loadAccruedUser(req.userId);
    const completed = new Set(user.completedTasks ?? []);
    let bonus = 0;
    if (!completed.has(task.id)) {
      completed.add(task.id);
      bonus = task.reward;
      user = { ...user, points: user.points + bonus, completedTasks: Array.from(completed) };
      user = addTransaction(user, { type: 'task', title: task.title, coins: bonus });
    }
    saveUser(req.userId, user);
    markPaymentProcessed(reference, { userId: req.userId, taskId: task.id, amountGhs: txn.amount, at: Date.now() });
    res.json({ bonus, alreadyCompleted: bonus === 0, state: publicState(user) });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not verify this payment yet — try again shortly' });
  }
});

// --- Friends tab: referral code + list of invited friends ---
app.get('/api/referrals', requireUserId, (req, res) => {
  const user = loadAccruedUser(req.userId);
  saveUser(req.userId, user);
  res.json({
    referralCode: user.referralCode,
    referredBy: user.referredBy,
    friends: (user.referrals ?? []).map((r) => ({ userId: r.userId, joinedAt: r.joinedAt, earned: referralBonusReferrer() })),
    bonusPerFriend: referralBonusReferrer(),
  });
});

// Redeem someone else's referral code (only once, and not your own).
app.post('/api/referral/redeem', requireUserId, (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Missing referral code' });
  }
  let user = loadAccruedUser(req.userId);
  if (user.blocked) {
    return sendBlocked(req, res, user);
  }
  if (user.referredBy) {
    return res.status(409).json({ error: 'Referral already applied', state: publicState(user) });
  }
  if (code === user.referralCode) {
    return res.status(400).json({ error: "You can't use your own code" });
  }
  const referrer = findUserByReferralCode(code);
  if (!referrer) {
    return res.status(404).json({ error: 'Invalid referral code' });
  }
  // Each side only earns their bonus if *they* already own a character —
  // the link/relationship is still recorded either way.
  const refereeBonus = hasAnyCharacter(user) ? referralBonusReferee() : 0;
  const referrerBonus = hasAnyCharacter(referrer) ? referralBonusReferrer() : 0;
  user = {
    ...user,
    referredBy: referrer.userId,
    points: user.points + refereeBonus,
  };
  if (refereeBonus > 0) {
    user = addTransaction(user, { type: 'referral', title: 'Referral bonus', coins: refereeBonus });
  }
  // Auto-complete the 'redeem-code' task — same character-ownership gate as
  // the referral bonus above, and only once per player.
  const completed = new Set(user.completedTasks ?? []);
  let taskBonus = 0;
  if (hasAnyCharacter(user) && !completed.has(REDEEM_TASK_ID)) {
    const redeemTask = getTasks().find((t) => t.id === REDEEM_TASK_ID);
    if (redeemTask) {
      completed.add(REDEEM_TASK_ID);
      taskBonus = redeemTask.reward;
      user = { ...user, points: user.points + taskBonus, completedTasks: Array.from(completed) };
      user = addTransaction(user, { type: 'task', title: redeemTask.title, coins: taskBonus });
    }
  }
  let updatedReferrer = {
    ...referrer,
    points: referrer.points + referrerBonus,
    referrals: [...(referrer.referrals ?? []), { userId: user.userId, joinedAt: Date.now() }],
  };
  if (referrerBonus > 0) {
    updatedReferrer = addTransaction(updatedReferrer, { type: 'referral', title: 'Friend joined with your code', coins: referrerBonus });
  }
  saveUser(req.userId, user);
  saveUser(referrer.userId, updatedReferrer);
  res.json({ bonus: refereeBonus + taskBonus, state: publicState(user) });
});

// --- Character tab: list roster with per-user ownership + selection state ---
app.get('/api/characters', requireUserId, (req, res) => {
  const user = loadAccruedUser(req.userId);
  saveUser(req.userId, user);
  const owned = new Set(user.ownedCharacters ?? []);
  res.json({
    characters: getCharacters().map((c) => ({
      ...c,
      // Amount a tap is worth once this character is equipped — same
      // multiplier that scales passive hourly income, applied to the base
      // coins-per-tap setting from Economy settings.
      pointsPerTap: Math.round(pointsPerTap() * c.profitMultiplier),
      owned: owned.has(c.id),
      selected: user.selectedCharacterId === c.id,
    })),
    selectedCharacterId: user.selectedCharacterId ?? null,
  });
});

// Purchase a character (once per user, if they can afford it).
app.post('/api/characters/:id/purchase', requireUserId, (req, res) => {
  const character = getCharacters().find((c) => c.id === req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'Unknown character' });
  }
  let user = loadAccruedUser(req.userId);
  const owned = new Set(user.ownedCharacters ?? []);
  if (owned.has(character.id)) {
    return res.status(409).json({ error: 'Already owned', state: publicState(user) });
  }
  if (user.points < character.price) {
    return res.status(402).json({ error: 'Not enough points', state: publicState(user) });
  }
  owned.add(character.id);
  const ownedCharacters = Array.from(owned);
  // Auto-equip if this is the user's first character, so earning switches on
  // immediately without a separate "Select" step.
  const selectedCharacterId = user.selectedCharacterId ?? character.id;
  user = {
    ...user,
    points: user.points - character.price,
    ownedCharacters,
    selectedCharacterId,
    profitPerHour: effectiveProfitPerHour(ownedCharacters, selectedCharacterId),
  };
  saveUser(req.userId, user);
  res.json({ state: publicState(user) });
});

// Shared by /api/characters/:id/purchase/confirm and the hub webhook: grants
// ownership of a character bought with real money (auto-equipping it if
// it's the player's first) and logs the transaction. No-ops if somehow
// already owned (e.g. the webhook and the confirm call both landed).
// Idempotency against the *payment reference* itself is handled by callers
// via isPaymentProcessed/markPaymentProcessed before this runs.
function grantCharacterPurchase(user, character, amountGhs) {
  const owned = new Set(user.ownedCharacters ?? []);
  if (owned.has(character.id)) return user;
  owned.add(character.id);
  const ownedCharacters = Array.from(owned);
  const selectedCharacterId = user.selectedCharacterId ?? character.id;
  let next = {
    ...user,
    ownedCharacters,
    selectedCharacterId,
    profitPerHour: effectiveProfitPerHour(ownedCharacters, selectedCharacterId),
  };
  next = addTransaction(next, { type: 'character', title: `${character.name} (card payment)`, coins: 0, amountGhs });
  return next;
}

// --- Buy a character with real money via the Payment Hub, instead of
// spending in-game coins. Same Payment-Hub-hosted Paystack checkout pattern
// as the wallet top-up / task-verification / unblock flows above. The price
// charged is the character's normal coin price converted to GHS at the
// current pointsPerGhs rate (see characterPurchaseCostGhs in game.js).

// Step 1: start a hub checkout for this character.
app.post('/api/characters/:id/purchase/initialize', requireUserId, async (req, res) => {
  const character = getCharacters().find((c) => c.id === req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'Unknown character' });
  }
  let user = loadAccruedUser(req.userId);
  if (user.blocked) {
    return sendBlocked(req, res, user);
  }
  const owned = new Set(user.ownedCharacters ?? []);
  if (owned.has(character.id)) {
    saveUser(req.userId, user);
    return res.status(409).json({ error: 'Already owned', state: publicState(user) });
  }

  const costGhs = characterPurchaseCostGhs(character);
  const { email: submittedEmail } = req.body || {};
  const account = getAccountByUserId(req.userId);
  const email = account ? account.email : submittedEmail;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    saveUser(req.userId, user);
    return res.status(400).json({ error: 'A valid email is required to pay via card' });
  }

  if (!hubConfigured()) {
    // DEMO mode: skip the hub/Paystack entirely and grant the character
    // immediately, purely so the flow is testable without live hub credentials.
    user = grantCharacterPurchase(user, character, costGhs);
    saveUser(req.userId, user);
    return res.json({ authorizationUrl: null, reference: null, demo: true, state: publicState(user) });
  }

  saveUser(req.userId, user);
  if (!APP_PUBLIC_URL) {
    return res.status(500).json({ error: 'Server misconfigured: APP_PUBLIC_URL is not set' });
  }

  try {
    // Carry the character id through the redirect so the frontend knows
    // which purchase to confirm once the hub sends the browser back here.
    const redirectUrl = `${APP_PUBLIC_URL}/?characterId=${encodeURIComponent(character.id)}`;
    const { reference, authorizationUrl } = await initializeTransaction({
      email,
      amountGhs: costGhs,
      redirectUrl,
      metadata: { userId: req.userId, characterId: character.id },
    });
    res.json({ authorizationUrl, reference });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not start this purchase' });
  }
});

// Step 2: once the hub redirects back with ?reference=..., confirm and grant
// the character. Always re-verified against the hub/Paystack — never trust
// the redirect alone.
app.post('/api/characters/:id/purchase/confirm', requireUserId, async (req, res) => {
  const character = getCharacters().find((c) => c.id === req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'Unknown character' });
  }
  const { reference } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'Missing payment reference' });
  }
  if (isPaymentProcessed(reference)) {
    const user = loadAccruedUser(req.userId);
    saveUser(req.userId, user);
    return res.json({
      owned: (user.ownedCharacters ?? []).includes(character.id),
      alreadyProcessed: true,
      state: publicState(user),
    });
  }

  try {
    const txn = await verifyTransaction(reference);
    if (txn.status !== 'SUCCESS') {
      return res.status(402).json({ error: `Payment status: ${txn.status}` });
    }
    if (String(txn.currency || '').toUpperCase() !== 'GHS') {
      return res.status(400).json({ error: 'Unexpected payment currency' });
    }
    let user = loadAccruedUser(req.userId);
    user = grantCharacterPurchase(user, character, txn.amount);
    saveUser(req.userId, user);
    markPaymentProcessed(reference, { userId: req.userId, characterId: character.id, amountGhs: txn.amount, at: Date.now() });
    res.json({ owned: true, state: publicState(user) });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Could not verify this payment yet — try again shortly' });
  }
});

// Equip an owned character. This is what changes the hamster shown on the
// Mine screen, and its profitMultiplier is what makes mining faster.
app.post('/api/characters/:id/select', requireUserId, (req, res) => {
  const character = getCharacters().find((c) => c.id === req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'Unknown character' });
  }
  let user = loadAccruedUser(req.userId);
  const owned = new Set(user.ownedCharacters ?? []);
  if (!owned.has(character.id)) {
    return res.status(403).json({ error: 'Purchase this character before equipping it', state: publicState(user) });
  }
  user = {
    ...user,
    selectedCharacterId: character.id,
    profitPerHour: effectiveProfitPerHour(user.ownedCharacters ?? [], character.id),
  };
  saveUser(req.userId, user);
  res.json({ state: publicState(user) });
});

// --- Admin portal page ---
// Served straight from /public (not from the built dist/), so it's
// available even before the game frontend has been built, and a redeploy of
// public/admin.html doesn't require a full `vite build`. Not linked from the
// game UI; only reachable if you know the URL, and every action still
// requires the x-admin-key header set above.
const publicPath = path.join(__dirname, '..', 'public');
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(publicPath, 'admin.html'));
});
// Also serve /public's static assets (e.g. logo.png, used by admin.html)
// directly, so they resolve even before `dist/` exists — Vite normally
// copies public/* into dist/ at build time, but the admin page itself
// bypasses Vite entirely (see comment above).
app.use(express.static(publicPath));

// --- Serve the built frontend in production ---
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Hamster Kombat backend listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  flush();
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  flush();
  server.close(() => process.exit(0));
});
