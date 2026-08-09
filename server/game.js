import { getSettings, listCharacters, listTasks } from './settings.js';

// Mirrors the level thresholds used on the frontend so points -> level stays consistent.
export const LEVEL_NAMES = [
  'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond',
  'Epic', 'Legendary', 'Master', 'GrandMaster', 'Lord',
];

export const LEVEL_MIN_POINTS = [
  0, 5000, 25000, 100000, 1000000,
  2000000, 10000000, 50000000, 100000000, 1000000000,
];

// Hour of day (UTC) each daily bonus resets at — matches the original countdown logic.
export const DAILY_TARGET_HOUR = {
  reward: 0,
  cipher: 19,
  combo: 12,
};

// --- Everything below reads live from server/settings.js (admin-editable,
// persisted in db.json), so a change made in the admin panel takes effect
// immediately for every request — no restart needed. ---

export function pointsPerTap() {
  return getSettings().pointsPerTap;
}

// The equipped character's profitMultiplier scales tap earnings the same
// way it scales passive hourly income — a higher-rank character is worth
// more per tap, not just more per hour.
export function effectivePointsPerTap(selectedCharacterId) {
  return Math.round(pointsPerTap() * characterMultiplier(selectedCharacterId));
}

export function defaultProfitPerHour() {
  return getSettings().defaultProfitPerHour;
}

export function dailyBonusAmount() {
  return getSettings().dailyBonusAmount;
}

// The task that auto-completes when a player redeems a friend's referral
// code (server/index.js's /api/referral/redeem route) — not claimable via
// the generic /api/tasks/:id/complete route.
export const REDEEM_TASK_ID = 'redeem-code';

// The seeded task that requires a small real-money verification payment
// (task.verifyCost, in GHS) before its reward can be claimed. Any task can
// have a verifyCost set via the admin panel though — this id is just what
// ships by default.
export const VERIFY_TASK_ID = 'verify-account';

export function getTasks() {
  return listTasks();
}

export function taskVerifyCostGhs(task) {
  const cost = Number(task?.verifyCost);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

// Withdrawal gate: a player must have completed every task on the current
// roster (getTasks()) before /api/wallet/withdraw will accept a request.
// Uses the *current* admin-configured task list, so a task added after a
// player already withdrew before doesn't retroactively lock them out of
// past withdrawals — it only affects future ones. Tasks removed by an admin
// simply drop out of the requirement automatically (no ids to reconcile).
export function requiredTaskIds() {
  return getTasks().map((t) => t.id);
}

export function completedTaskIds(user) {
  return new Set(user.completedTasks ?? []);
}

export function outstandingTaskIds(user) {
  const done = completedTaskIds(user);
  return requiredTaskIds().filter((id) => !done.has(id));
}

export function allTasksCompleted(user) {
  return outstandingTaskIds(user).length === 0;
}

// --- Anti-autoclicker: tap-rate limiting + block/unblock ---
export function maxTapsPerSecond() {
  return getSettings().maxTapsPerSecond;
}

export function tapStrikesLimit() {
  return getSettings().tapStrikesLimit;
}

export function unblockPriceGhs() {
  return getSettings().unblockPriceGhs;
}

// Called once per /api/tap batch (never per individual tap — the frontend
// batches and flushes every ~1.5s). Compares this batch's implied taps/sec
// against maxTapsPerSecond(): a batch over the limit adds a "strike", a
// clean batch removes one, and hitting tapStrikesLimit() blocks the whole
// account (every points-earning route checks user.blocked) until the
// player pays unblockPriceGhs() via the /api/unblock flow in server/index.js.
// The very first tap ever (no lastTapAt yet) is never evaluated, since
// there's no prior timestamp to compute a rate against.
export function evaluateTapBatch(user, count, now) {
  const last = Number(user.lastTapAt) || 0;
  let strikes = user.tapStrikes || 0;
  let justBlocked = false;
  if (last > 0 && now > last) {
    const elapsedSec = Math.max((now - last) / 1000, 0.001);
    const rate = count / elapsedSec;
    if (rate > maxTapsPerSecond()) {
      strikes += 1;
      if (!user.blocked && strikes >= tapStrikesLimit()) {
        justBlocked = true;
      }
    } else {
      strikes = Math.max(0, strikes - 1);
    }
  }
  return {
    ...user,
    lastTapAt: now,
    tapStrikes: strikes,
    blocked: user.blocked || justBlocked,
    blockedAt: justBlocked ? now : (user.blockedAt ?? null),
    blockedReason: justBlocked ? 'Tapping faster than humanly possible (autoclicker/macro suspected)' : (user.blockedReason ?? null),
  };
}

// Clears a block (either because the player paid the unblock fee, or an
// admin manually unblocked them via the admin panel).
export function clearBlock(user) {
  return { ...user, blocked: false, blockedAt: null, blockedReason: null, tapStrikes: 0 };
}

export function referralBonusReferrer() {
  return getSettings().referralBonusReferrer;
}

export function referralBonusReferee() {
  return getSettings().referralBonusReferee;
}

export function generateReferralCode(userId) {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

// --- Character tab: purchasable hamster characters ---
export function getCharacters() {
  return listCharacters();
}

// profitMultiplier is applied to defaultProfitPerHour() when a character is
// equipped (selected) — higher ranks mine faster.
export function characterMultiplier(selectedCharacterId) {
  if (!selectedCharacterId) return 1;
  const character = listCharacters().find((c) => c.id === selectedCharacterId);
  return character ? character.profitMultiplier : 1;
}

// A user with no owned characters earns nothing from anywhere in the app —
// mining/tapping/bonuses only switch on once they own at least one character.
export function hasAnyCharacter(user) {
  return (user?.ownedCharacters ?? []).length > 0;
}

export function effectiveProfitPerHour(ownedCharacters, selectedCharacterId) {
  if (!(ownedCharacters ?? []).length) return 0;
  return Math.round(defaultProfitPerHour() * characterMultiplier(selectedCharacterId));
}

// --- Wallet: real-money coin top-ups via Paystack ---
export function pointsPerGhs() {
  return getSettings().pointsPerGhs;
}

export function topupPresetsGhs() {
  return getSettings().topupPresetsGhs;
}

export function coinsForGhs(amountGhs) {
  return Math.round(Number(amountGhs) * pointsPerGhs());
}

export function ghsForCoins(coins) {
  return Number(coins) / pointsPerGhs();
}

// --- Wallet: cash-out coins back to GHS ---
// This is a real, admin-reviewed withdrawal flow, not an automated payout:
// a request debits the user's coins immediately and sits as 'pending' until
// an admin (via the /api/admin/withdrawals endpoints or public/admin.html)
// sends the money manually — e.g. a mobile money transfer — and marks it
// paid. There's no Paystack Transfers integration wired up; this is the
// lightweight manual-payout model instead.
export function minWithdrawalGhs() {
  return getSettings().minWithdrawalGhs;
}

export const TRANSACTION_HISTORY_LIMIT = 30;

// Appends a transaction to a user's history (most recent first, capped).
// coins should be signed: positive for a credit, negative for a debit.
// Pass `id` when you need to reference this transaction later (e.g. a
// withdrawal request whose status changes once an admin settles it).
export function addTransaction(user, { id = null, type, title, coins, amountGhs = null, status = 'completed' }) {
  const tx = {
    id: id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    type, // 'task' | 'daily' | 'referral' | 'topup' | 'withdrawal'
    title,
    coins,
    amountGhs,
    status, // 'completed' | 'pending' | 'failed'
    createdAt: Date.now(),
  };
  const transactions = [tx, ...(user.transactions ?? [])].slice(0, TRANSACTION_HISTORY_LIMIT);
  return { ...user, transactions };
}

// Updates the status of an existing transaction by id (e.g. a withdrawal
// moving from 'pending' to 'completed' once an admin pays it out).
export function updateTransactionStatus(user, txId, status) {
  const transactions = (user.transactions ?? []).map((t) => (t.id === txId ? { ...t, status } : t));
  return { ...user, transactions };
}

export function levelIndexForPoints(points) {
  let idx = 0;
  for (let i = 0; i < LEVEL_MIN_POINTS.length; i++) {
    if (points >= LEVEL_MIN_POINTS[i]) idx = i;
  }
  return idx;
}

export function defaultUser(userId) {
  const now = Date.now();
  return {
    userId,
    points: 0,
    profitPerHour: 0, // no character owned yet — mining is off until they get one
    lastClaimed: { reward: 0, cipher: 0, combo: 0 },
    lastSeenAt: now,
    createdAt: now,
    referralCode: generateReferralCode(userId),
    referredBy: null,
    referrals: [], // [{ userId, joinedAt }]
    completedTasks: [], // task ids
    ownedCharacters: [], // character ids
    selectedCharacterId: null, // equipped character (must be owned)
    transactions: [], // coin ledger: tasks, daily bonuses, referrals, top-ups, withdrawals
    // Anti-autoclicker state (see evaluateTapBatch above).
    lastTapAt: null, // ms timestamp of the last /api/tap batch, used to compute taps/sec
    tapStrikes: 0, // consecutive over-the-limit batches
    blocked: false, // true once tapStrikesLimit is hit — blocks all earning routes
    blockedAt: null,
    blockedReason: null,
  };
}

// Returns the timestamp (ms) of the most recent occurrence of targetHour:00 UTC that
// is <= now. Bonuses become claimable again once this "window start" moves forward.
export function currentWindowStart(targetHour, now = Date.now()) {
  const d = new Date(now);
  const windowStart = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), targetHour, 0, 0, 0
  ));
  if (windowStart.getTime() > now) {
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  }
  return windowStart.getTime();
}

export function msUntilNextWindow(targetHour, now = Date.now()) {
  const start = currentWindowStart(targetHour, now);
  const nextStart = start + 24 * 60 * 60 * 1000;
  return nextStart - now;
}

// Applies passive-income accrual for time elapsed since lastSeenAt (covers offline earnings).
// The elapsed time is credited at whatever rate was already stored on the
// user (so an admin changing the mining rate mid-session doesn't retroactively
// rewrite past earnings); profitPerHour is then refreshed to the *current*
// effective rate so the new rate applies going forward immediately.
export function applyAccrual(user, now = Date.now()) {
  const ownedCharacters = user.ownedCharacters ?? [];
  const owns = ownedCharacters.length > 0;
  const elapsedMs = Math.max(0, now - (user.lastSeenAt ?? now));
  const priorRate = owns ? (user.profitPerHour || effectiveProfitPerHour(ownedCharacters, user.selectedCharacterId ?? null)) : 0;
  const earned = owns ? Math.floor((priorRate / 3600000) * elapsedMs) : 0;
  return {
    ...user,
    points: user.points + earned,
    lastSeenAt: now,
    // Backfill fields for accounts created before referrals/tasks existed.
    referralCode: user.referralCode ?? generateReferralCode(user.userId),
    referredBy: user.referredBy ?? null,
    referrals: user.referrals ?? [],
    completedTasks: user.completedTasks ?? [],
    ownedCharacters,
    selectedCharacterId: user.selectedCharacterId ?? null,
    transactions: user.transactions ?? [],
    // Backfill anti-autoclicker fields for accounts created before this existed.
    lastTapAt: user.lastTapAt ?? null,
    tapStrikes: user.tapStrikes ?? 0,
    blocked: user.blocked ?? false,
    blockedAt: user.blockedAt ?? null,
    blockedReason: user.blockedReason ?? null,
    // Keep profitPerHour in sync with character ownership/equip state AND
    // the current admin-configured rate/multipliers — 0 whenever no
    // character is owned, regardless of what was stored before.
    profitPerHour: owns ? effectiveProfitPerHour(ownedCharacters, user.selectedCharacterId ?? null) : 0,
  };
}

export function publicState(user) {
  const now = Date.now();
  const levelIndex = levelIndexForPoints(user.points);
  const timers = {};
  const claimable = {};
  for (const type of Object.keys(DAILY_TARGET_HOUR)) {
    const targetHour = DAILY_TARGET_HOUR[type];
    timers[type] = msUntilNextWindow(targetHour, now);
    claimable[type] = (user.lastClaimed?.[type] ?? 0) < currentWindowStart(targetHour, now);
  }
  return {
    userId: user.userId,
    points: user.points,
    levelIndex,
    levelName: LEVEL_NAMES[levelIndex],
    levelCount: LEVEL_NAMES.length,
    profitPerHour: user.profitPerHour,
    pointsPerTap: effectivePointsPerTap(user.selectedCharacterId ?? null),
    dailyTimersMs: timers,
    dailyClaimable: claimable,
    dailyBonusAmount: dailyBonusAmount(),
    referralCode: user.referralCode,
    referredBy: user.referredBy,
    referralsCount: (user.referrals ?? []).length,
    referralEarnings: (user.referrals ?? []).length * referralBonusReferrer(),
    completedTasks: user.completedTasks ?? [],
    ownedCharacters: user.ownedCharacters ?? [],
    selectedCharacterId: user.selectedCharacterId ?? null,
    canEarn: hasAnyCharacter(user),
    blocked: user.blocked ?? false,
    blockedReason: user.blockedReason ?? null,
    unblockPriceGhs: unblockPriceGhs(),
    pointsPerGhs: pointsPerGhs(),
    minWithdrawalGhs: minWithdrawalGhs(),
    topupPresetsGhs: topupPresetsGhs(),
    tasksTotal: requiredTaskIds().length,
    tasksCompletedCount: requiredTaskIds().length - outstandingTaskIds(user).length,
    allTasksCompleted: allTasksCompleted(user),
    transactions: (user.transactions ?? []).slice(0, TRANSACTION_HISTORY_LIMIT),
  };
}
