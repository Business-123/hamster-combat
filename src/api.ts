export type GameState = {
  userId: string;
  points: number;
  levelIndex: number;
  levelName: string;
  levelCount: number;
  profitPerHour: number;
  pointsPerTap: number;
  dailyTimersMs: { reward: number; cipher: number; combo: number };
  dailyClaimable: { reward: boolean; cipher: boolean; combo: boolean };
  dailyBonusAmount: { reward: number; cipher: number; combo: number };
  referralCode: string;
  referredBy: string | null;
  referralsCount: number;
  referralEarnings: number;
  completedTasks: string[];
  ownedCharacters: string[];
  selectedCharacterId: string | null;
  canEarn: boolean;
  pointsPerGhs: number;
  minWithdrawalGhs: number;
  topupPresetsGhs: number[];
  tasksTotal: number;
  tasksCompletedCount: number;
  allTasksCompleted: boolean;
  transactions: Transaction[];
  // Anti-autoclicker: true once the account has been blocked for tapping
  // faster than humanly possible (server/game.js's evaluateTapBatch). While
  // true, every earning route (tap/claim/tasks/referral redeem) is locked
  // out until the unblock fee below is paid via /api/unblock/*.
  blocked: boolean;
  blockedReason: string | null;
  unblockPriceGhs: number;
};

export type Transaction = {
  id: string;
  type: 'task' | 'daily' | 'referral' | 'topup' | 'withdrawal' | 'admin' | 'unblock';
  title: string;
  coins: number; // signed: positive = credit, negative = debit
  amountGhs: number | null;
  status: 'completed' | 'pending' | 'failed';
  createdAt: number;
};

export type Task = {
  id: string;
  title: string;
  reward: number;
  url: string | null;
  completed: boolean;
  // GHS amount that must be paid (via the Payment Hub) to verify and claim
  // this task. 0/absent means the task is free — claim it directly.
  verifyCost?: number;
};

export type Character = {
  id: string;
  name: string;
  rank: string;
  price: number;
  profitMultiplier: number;
  // Coins earned per tap once this character is equipped (base coins-per-tap
  // from Economy settings, scaled by profitMultiplier — server-computed).
  pointsPerTap: number;
  // Set by an admin in the admin panel. When image is empty, the UI falls
  // back to the bundled hamster artwork tinted with gradient/glow.
  image?: string | null;
  gradient?: string;
  glow?: string;
  owned: boolean;
  selected: boolean;
};

export type ReferralInfo = {
  referralCode: string;
  referredBy: string | null;
  friends: { userId: string; joinedAt: number; earned: number }[];
  bonusPerFriend: number;
};

const USER_ID_KEY = 'hamster-kombat-user-id';

async function getOrCreateUserId(): Promise<string> {
  const existing = localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;

  const res = await fetch('/api/users', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create user');
  const state: GameState = await res.json();
  localStorage.setItem(USER_ID_KEY, state.userId);
  return state.userId;
}

async function authedFetch<T = GameState>(path: string, init: RequestInit = {}): Promise<T> {
  const userId = await getOrCreateUserId();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'x-user-id': userId,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `Request failed: ${res.status}`), { state: body.state });
  }
  return res.json();
}

export function fetchState(): Promise<GameState> {
  return authedFetch('/api/state');
}

export function tap(count = 1): Promise<GameState> {
  return authedFetch('/api/tap', {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}

export async function claim(type: 'reward' | 'cipher' | 'combo'): Promise<{ bonus: number; state: GameState }> {
  return authedFetch(`/api/claim/${type}`, { method: 'POST' });
}

export function fetchTasks(): Promise<{ tasks: Task[] }> {
  return authedFetch('/api/tasks');
}

export function completeTask(id: string): Promise<{ bonus: number; state: GameState }> {
  return authedFetch(`/api/tasks/${id}/complete`, { method: 'POST' });
}

// Verified tasks (task.verifyCost > 0) go through this Payment-Hub-hosted
// checkout instead of completeTask — same pattern as initializeTopUp/verifyTopUp.
export function initializeTaskVerification(
  id: string,
  email?: string
): Promise<{ authorizationUrl: string | null; reference: string | null; demo?: boolean; bonus?: number; state?: GameState }> {
  return authedFetch(`/api/tasks/${id}/verify/initialize`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function confirmTaskVerification(
  id: string,
  reference: string
): Promise<{ bonus: number; alreadyCompleted: boolean; state: GameState }> {
  return authedFetch(`/api/tasks/${id}/verify/confirm`, {
    method: 'POST',
    body: JSON.stringify({ reference }),
  });
}

export function fetchCharacters(): Promise<{ characters: Character[]; selectedCharacterId: string | null }> {
  return authedFetch('/api/characters');
}

export function purchaseCharacter(id: string): Promise<{ state: GameState }> {
  return authedFetch(`/api/characters/${id}/purchase`, { method: 'POST' });
}

export function selectCharacter(id: string): Promise<{ state: GameState }> {
  return authedFetch(`/api/characters/${id}/select`, { method: 'POST' });
}

export function fetchReferrals(): Promise<ReferralInfo> {
  return authedFetch('/api/referrals');
}

export function redeemReferral(code: string): Promise<{ bonus: number; state: GameState }> {
  return authedFetch('/api/referral/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// Buy coins with real money, via the central Payment Hub (this game never
// talks to Paystack directly, and never sees a Paystack key).
// These are only used as a last-resort fallback before the first successful
// /api/state — the real, admin-configurable values live on GameState
// (pointsPerGhs / topupPresetsGhs), which is what the UI should read.
export const COINS_PER_GHS = 1000;
export const TOPUP_PRESETS_GHS = [5, 10, 20, 50];

// Step 1: ask our server to start a hub-hosted Paystack checkout. Returns the
// URL to full-page-redirect the browser to. If the hub isn't configured
// (local/demo use), authorization_url is null and coins/state are credited
// immediately instead.
export function initializeTopUp(
  amountGhs: number,
  email: string
): Promise<{ authorization_url: string | null; reference: string | null; demo?: boolean; coins?: number; state?: GameState }> {
  return authedFetch('/api/wallet/topup/initialize', {
    method: 'POST',
    body: JSON.stringify({ amountGhs, email }),
  }).then((data: any) => ({
    authorization_url: data.authorizationUrl,
    reference: data.reference,
    demo: data.demo,
    coins: data.coins,
    state: data.state,
  }));
}

// Step 2: after the hub redirects the browser back with ?reference=..., confirm
// and credit coins. The server re-verifies with the hub — never trust the
// redirect alone.
export function verifyTopUp(reference: string): Promise<{ credited: number; alreadyCredited: boolean; state: GameState }> {
  return authedFetch('/api/wallet/topup/verify', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  });
}

// --- Anti-autoclicker: pay to clear a block ---
// Same Payment-Hub-hosted Paystack checkout pattern as the wallet top-up /
// task verification flows.
export function initializeUnblock(
  email?: string
): Promise<{ authorizationUrl: string | null; reference: string | null; demo?: boolean; state?: GameState }> {
  return authedFetch('/api/unblock/initialize', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function confirmUnblock(reference: string): Promise<{ unblocked: boolean; state: GameState }> {
  return authedFetch('/api/unblock/confirm', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  });
}

// Withdraw coins back to GHS. This debits coins right away and files a real
// pending request — an admin reviews it (server/index.js's /api/admin/withdrawals,
// or public/admin.html), sends the payout manually, and marks it paid.
export function withdraw(
  amountGhs: number,
  destination: string
): Promise<{ message: string; state: GameState }> {
  return authedFetch('/api/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amountGhs, destination }),
  });
}


