// All the "knobs" an admin can turn without touching code: mining rate,
// character prices/images, the coin-purchase exchange rate, minimum
// withdrawal, task rewards, daily bonuses, and referral bonuses.
//
// Persisted in the same db.json as everything else (see DATA.md — needs a
// mounted volume in production), under a top-level `settings` key, so
// changes made via the admin panel survive restarts and take effect
// immediately for every request (no redeploy needed).
import { getRawSettings, saveSettings } from './db.js';

// Seed values — identical to what used to be hardcoded in game.js. These are
// only used the very first time the server runs (nothing in db.json yet), or
// to backfill any field an older db.json doesn't have.
export const DEFAULT_SETTINGS = {
  // --- Mining / tapping ---
  pointsPerTap: 11, // coins earned per tap
  defaultProfitPerHour: 3600, // base passive mining rate (coins/hour) before a character's multiplier

  // --- Buying coins with real money ---
  pointsPerGhs: 1000, // in-game coins per 1 GHS paid
  topupPresetsGhs: [5, 10, 20, 50], // quick-buy amount buttons shown in the Wallet tab

  // --- Cashing coins back out ---
  minWithdrawalGhs: 5,

  // --- Anti-autoclicker (tap rate limiting) ---
  // A trained human's sustained single-finger tap rate tops out around
  // 8-10 taps/sec, with brief "jitter/butterfly clicking" bursts occasionally
  // reaching ~14-16 taps/sec. 15 taps/sec is a generous ceiling that should
  // almost never trip for a real player, while autoclicker/macro tools
  // (which commonly run 20-50+ taps/sec, often at suspiciously constant
  // intervals) will exceed it quickly. Each tap batch (see server/index.js's
  // /api/tap, sent by the frontend roughly every 1.5s) that exceeds this
  // rate adds a "strike"; a clean batch removes one. Hitting tapStrikesLimit
  // blocks the whole account (server/game.js's evaluateTapBatch) until the
  // unblock fee below is paid.
  maxTapsPerSecond: 15,
  tapStrikesLimit: 3,
  // GHS fee an autoclicker-blocked player must pay (via the Payment Hub,
  // same flow as wallet top-ups/task verification) to unblock their account.
  unblockPriceGhs: 0.01,

  // --- Referrals ---
  referralBonusReferrer: 25000, // paid to the person who invited
  referralBonusReferee: 10000, // paid to the person who joined via a code

  // --- Daily bonuses (Mine screen) ---
  dailyBonusAmount: { reward: 5000, cipher: 10000, combo: 25000 },

  // --- Characters (Character tab roster) ---
  // image: optional absolute URL. When empty, the frontend falls back to the
  // bundled hamster artwork tinted with `gradient`/`glow`.
  characters: [
    { id: 'nibbles', name: 'Nibbles', rank: 'Rookie', price: 50000, profitMultiplier: 1.1, image: null, gradient: 'linear-gradient(to bottom, #b0b6bd, #6b7280)', glow: '#9aa0a8' },
    { id: 'chubby-cheeks', name: 'Chubby Cheeks', rank: 'Bronze Fighter', price: 100000, profitMultiplier: 1.25, image: null, gradient: 'linear-gradient(to bottom, #d99a5c, #8a5a2c)', glow: '#c07f3d' },
    { id: 'turbo-paws', name: 'Turbo Paws', rank: 'Silver Striker', price: 200000, profitMultiplier: 1.5, image: null, gradient: 'linear-gradient(to bottom, #d7dbe0, #9aa1ab)', glow: '#c3cad2' },
    { id: 'duke-whiskers', name: 'Duke Whiskers', rank: 'Gold Champion', price: 300000, profitMultiplier: 1.85, image: null, gradient: 'linear-gradient(to bottom, #f3ba2f, #a9770b)', glow: '#f3ba2f' },
    { id: 'zorak', name: 'Zorak the Destroyer', rank: 'Platinum Titan', price: 400000, profitMultiplier: 2.25, image: null, gradient: 'linear-gradient(to bottom, #8fd3f4, #4a90c2)', glow: '#5aa8d6' },
    { id: 'kombat-king', name: 'Kombat King', rank: 'Legendary Master', price: 500000, profitMultiplier: 3, image: null, gradient: 'linear-gradient(to bottom, #a78bfa, #575def)', glow: '#8b7cf6' },
    { id: 'blaze-fang', name: 'Blaze Fang', rank: 'Diamond Vanguard', price: 750000, profitMultiplier: 3.75, image: null, gradient: 'linear-gradient(to bottom, #b9f2ff, #2e9fc2)', glow: '#4fc3e0' },
    { id: 'shadow-strike', name: 'Shadow Strike', rank: 'Epic Ravager', price: 1200000, profitMultiplier: 4.75, image: null, gradient: 'linear-gradient(to bottom, #ff6ec7, #7b2ff7)', glow: '#b83bf0' },
    { id: 'iron-colossus', name: 'Iron Colossus', rank: 'Master Warlord', price: 2000000, profitMultiplier: 6.25, image: null, gradient: 'linear-gradient(to bottom, #ff9a5c, #b0242b)', glow: '#ff6a3d' },
    { id: 'lord-hamzilla', name: 'Lord Hamzilla', rank: 'GrandMaster Overlord', price: 3500000, profitMultiplier: 8.5, image: null, gradient: 'linear-gradient(to bottom, #ff4b4b, #1a1a1a)', glow: '#ff3b3b' },
  ],

  // --- Tasks (Earn tab roster). `verifyCost` (GHS) is optional and only
  // present on tasks that require a small real-money verification payment
  // (via the Payment Hub) before the reward can be claimed — 0/absent means
  // "free, claim instantly" like the rest of the roster. `id:
  // 'verify-account'` is special-cased by the task-verification routes —
  // keep that id if editing it, and keep it last in this list so it's the
  // final step in the Earn tab. `id: 'redeem-code'` is special-cased by the
  // referral-redeem route — it auto-completes when a player redeems a
  // friend's referral code, rather than being claimable directly — keep
  // that id if editing it.
  tasks: [
    { id: 'join-telegram', title: 'Join our Telegram channel', reward: 5000, url: 'https://telegram.org', verifyCost: 0 },
    { id: 'follow-x', title: 'Follow us on X', reward: 5000, url: 'https://x.com', verifyCost: 0 },
    { id: 'subscribe-youtube', title: 'Subscribe on YouTube', reward: 10000, url: 'https://youtube.com', verifyCost: 0 },
    { id: 'join-chat', title: 'Join the community chat', reward: 5000, url: 'https://telegram.org', verifyCost: 0 },
    { id: 'invite-friend', title: "Invite your first friend", reward: 10000, url: null, verifyCost: 0 },
    { id: 'redeem-code', title: "Redeem a friend's code", reward: 20000, url: null, verifyCost: 0 },
    { id: 'verify-account', title: 'Verify your account', reward: 20000, url: null, verifyCost: 0.01 },
  ],
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugify(name, existingIds) {
  const base = String(name || 'item')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

let cache = null;

// Loads settings from db.json, backfilling any field missing from an older
// save (e.g. upgrading from a version of this app that didn't have
// settings.js yet, or one that predates a newly-added field).
function ensureLoaded() {
  if (cache) return cache;
  const raw = getRawSettings();
  if (!raw) {
    cache = { ...deepClone(DEFAULT_SETTINGS), removedDefaultTaskIds: [] };
    saveSettings(cache);
    return cache;
  }
  const removedDefaultTaskIds = Array.isArray(raw.removedDefaultTaskIds)
    ? raw.removedDefaultTaskIds.filter((id) => typeof id === 'string')
    : [];
  cache = {
    ...deepClone(DEFAULT_SETTINGS),
    ...raw,
    dailyBonusAmount: { ...DEFAULT_SETTINGS.dailyBonusAmount, ...(raw.dailyBonusAmount || {}) },
    topupPresetsGhs: Array.isArray(raw.topupPresetsGhs) && raw.topupPresetsGhs.length
      ? raw.topupPresetsGhs
      : deepClone(DEFAULT_SETTINGS.topupPresetsGhs),
    characters: Array.isArray(raw.characters) && raw.characters.length
      ? raw.characters
      : deepClone(DEFAULT_SETTINGS.characters),
    removedDefaultTaskIds,
    tasks: mergeTasks(raw.tasks, removedDefaultTaskIds),
  };
  // Persist the merge so newly-appeared default tasks (and the verifyCost
  // backfill) are written to disk immediately, not just held in memory —
  // otherwise the admin panel's "current settings" view would look stale
  // until the next edit triggers a save.
  if (!raw.tasks || !Array.isArray(raw.tasks) || raw.tasks.length !== cache.tasks.length) {
    persist();
  }
  return cache;
}

// Combines whatever tasks are already saved (preserving any admin edits —
// title/reward/url/verifyCost changes, and re-ordering) with any tasks that
// exist in DEFAULT_SETTINGS but aren't in the saved list yet, matched by
// `id`. This is what lets newly-added default tasks (like a new task added
// in code after the app already went live) show up for existing deployments
// without wiping out admin customizations to the tasks that already exist.
// `removedDefaultTaskIds` are default tasks an admin explicitly deleted —
// they're excluded from the "add missing defaults" step so a deletion
// sticks across restarts instead of the task reappearing.
function mergeTasks(rawTasks, removedDefaultTaskIds = []) {
  const removed = new Set(removedDefaultTaskIds);
  if (!Array.isArray(rawTasks) || !rawTasks.length) {
    return deepClone(DEFAULT_SETTINGS.tasks).filter((t) => !removed.has(t.id));
  }
  const backfilled = rawTasks.map((t) => ({ verifyCost: 0, ...t }));
  const existingIds = new Set(backfilled.map((t) => t.id));
  const missingDefaults = DEFAULT_SETTINGS.tasks.filter(
    (t) => !existingIds.has(t.id) && !removed.has(t.id)
  );
  return [...backfilled, ...deepClone(missingDefaults)];
}

function persist() {
  saveSettings(cache);
}

export function getSettings() {
  return ensureLoaded();
}

// --- General (single-value) settings ---
const GENERAL_KEYS = [
  'pointsPerTap',
  'defaultProfitPerHour',
  'pointsPerGhs',
  'minWithdrawalGhs',
  'referralBonusReferrer',
  'referralBonusReferee',
  'maxTapsPerSecond',
  'tapStrikesLimit',
  'unblockPriceGhs',
];

// Keys that must be at least 1 (rather than merely >= 0) since 0 would
// disable the anti-autoclicker check entirely or make it un-clearable.
const MIN_ONE_KEYS = new Set(['maxTapsPerSecond', 'tapStrikesLimit']);

export function updateGeneralSettings(patch = {}) {
  const s = ensureLoaded();
  for (const key of GENERAL_KEYS) {
    if (patch[key] === undefined || patch[key] === null || patch[key] === '') continue;
    const num = Number(patch[key]);
    const min = MIN_ONE_KEYS.has(key) ? 1 : 0;
    if (!Number.isFinite(num) || num < min) continue;
    s[key] = num;
  }
  if (patch.dailyBonusAmount && typeof patch.dailyBonusAmount === 'object') {
    for (const key of Object.keys(s.dailyBonusAmount)) {
      const val = patch.dailyBonusAmount[key];
      if (val === undefined || val === null || val === '') continue;
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0) continue;
      s.dailyBonusAmount[key] = num;
    }
  }
  if (Array.isArray(patch.topupPresetsGhs)) {
    const cleaned = patch.topupPresetsGhs
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (cleaned.length) s.topupPresetsGhs = cleaned;
  }
  persist();
  return s;
}

// --- Characters ---
export function listCharacters() {
  return ensureLoaded().characters;
}

// Creates a new character (no `id` given) or updates an existing one (id
// matches). Returns the full updated roster.
export function upsertCharacter(data = {}) {
  const s = ensureLoaded();
  const existingIds = new Set(s.characters.map((c) => c.id));
  const isUpdate = data.id && existingIds.has(data.id);

  const price = Number(data.price);
  const profitMultiplier = Number(data.profitMultiplier);

  if (isUpdate) {
    const idx = s.characters.findIndex((c) => c.id === data.id);
    const prev = s.characters[idx];
    s.characters[idx] = {
      ...prev,
      name: data.name !== undefined ? String(data.name).trim() || prev.name : prev.name,
      rank: data.rank !== undefined ? String(data.rank).trim() : prev.rank,
      price: Number.isFinite(price) && price >= 0 ? Math.round(price) : prev.price,
      profitMultiplier: Number.isFinite(profitMultiplier) && profitMultiplier > 0 ? profitMultiplier : prev.profitMultiplier,
      image: data.image !== undefined ? (String(data.image).trim() || null) : prev.image,
      gradient: data.gradient !== undefined ? (String(data.gradient).trim() || prev.gradient) : prev.gradient,
      glow: data.glow !== undefined ? (String(data.glow).trim() || prev.glow) : prev.glow,
    };
  } else {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Character name is required');
    const id = slugify(data.id || name, existingIds);
    s.characters.push({
      id,
      name,
      rank: String(data.rank || '').trim() || 'Recruit',
      price: Number.isFinite(price) && price >= 0 ? Math.round(price) : 50000,
      profitMultiplier: Number.isFinite(profitMultiplier) && profitMultiplier > 0 ? profitMultiplier : 1.1,
      image: data.image ? String(data.image).trim() : null,
      gradient: data.gradient ? String(data.gradient).trim() : 'linear-gradient(to bottom, #575def, #202731)',
      glow: data.glow ? String(data.glow).trim() : '#f3ba2f',
    });
  }
  persist();
  return s.characters;
}

export function deleteCharacter(id) {
  const s = ensureLoaded();
  if (s.characters.length <= 1) {
    throw new Error('At least one character must remain');
  }
  s.characters = s.characters.filter((c) => c.id !== id);
  persist();
  return s.characters;
}

// --- Tasks ---
export function listTasks() {
  return ensureLoaded().tasks;
}

export function upsertTask(data = {}) {
  const s = ensureLoaded();
  const existingIds = new Set(s.tasks.map((t) => t.id));
  const isUpdate = data.id && existingIds.has(data.id);
  const reward = Number(data.reward);
  // verifyCost is in GHS (e.g. 0.01) — leaving it blank/0 makes a task free
  // to claim, same as before this field existed.
  const verifyCost = Number(data.verifyCost);

  if (isUpdate) {
    const idx = s.tasks.findIndex((t) => t.id === data.id);
    const prev = s.tasks[idx];
    s.tasks[idx] = {
      ...prev,
      title: data.title !== undefined ? String(data.title).trim() || prev.title : prev.title,
      reward: Number.isFinite(reward) && reward >= 0 ? Math.round(reward) : prev.reward,
      url: data.url !== undefined ? (String(data.url).trim() || null) : prev.url,
      verifyCost: data.verifyCost !== undefined && data.verifyCost !== null && data.verifyCost !== ''
        ? (Number.isFinite(verifyCost) && verifyCost >= 0 ? verifyCost : prev.verifyCost)
        : (prev.verifyCost ?? 0),
    };
  } else {
    const title = String(data.title || '').trim();
    if (!title) throw new Error('Task title is required');
    const id = slugify(data.id || title, existingIds);
    s.tasks.push({
      id,
      title,
      reward: Number.isFinite(reward) && reward >= 0 ? Math.round(reward) : 5000,
      url: data.url ? String(data.url).trim() : null,
      verifyCost: Number.isFinite(verifyCost) && verifyCost >= 0 ? verifyCost : 0,
    });
    // If this id matches a default task the admin had previously deleted,
    // re-creating it here means they want it back — stop suppressing it.
    if (s.removedDefaultTaskIds.includes(id)) {
      s.removedDefaultTaskIds = s.removedDefaultTaskIds.filter((rid) => rid !== id);
    }
  }
  persist();
  return s.tasks;
}

export function deleteTask(id) {
  const s = ensureLoaded();
  s.tasks = s.tasks.filter((t) => t.id !== id);
  // Track deletions of built-in default tasks so the merge step in
  // ensureLoaded() doesn't bring them back on the next restart.
  const isDefaultTask = DEFAULT_SETTINGS.tasks.some((t) => t.id === id);
  if (isDefaultTask && !s.removedDefaultTaskIds.includes(id)) {
    s.removedDefaultTaskIds = [...s.removedDefaultTaskIds, id];
  }
  persist();
  return s.tasks;
}
