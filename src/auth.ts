import { GameState } from './api';

// Must match the key api.ts uses for x-user-id, so that once we're logged in
// every existing authedFetch call in api.ts keeps working unchanged — the
// login system only decides *which* userId ends up in this slot.
const USER_ID_KEY = 'hamster-kombat-user-id';
const TOKEN_KEY = 'hamster-kombat-session-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

async function parseJsonSafely(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function signup(
  email: string,
  password: string,
  name: string,
  phone?: string
): Promise<{ email: string; name: string; state: GameState }> {
  // Adopt any existing guest save into the new account rather than losing it.
  const guestUserId = localStorage.getItem(USER_ID_KEY) || undefined;
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, phone, guestUserId }),
  });
  const data = await parseJsonSafely(res);
  if (!res.ok) throw new Error(data.error || 'Could not create your account');
  setToken(data.token);
  localStorage.setItem(USER_ID_KEY, data.state.userId);
  return { email: data.email, name: data.name || '', state: data.state };
}

export async function login(email: string, password: string): Promise<{ email: string; name: string; state: GameState }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJsonSafely(res);
  if (!res.ok) throw new Error(data.error || 'Could not log you in');
  setToken(data.token);
  localStorage.setItem(USER_ID_KEY, data.state.userId);
  return { email: data.email, name: data.name || '', state: data.state };
}

// Called once on app load. Returns null (no error thrown) if there's no
// stored session, or if the stored token turned out to be invalid/expired —
// both just mean "show the login screen".
export async function restoreSession(): Promise<{ email: string; name: string; state: GameState } | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    const data = await res.json();
    localStorage.setItem(USER_ID_KEY, data.state.userId);
    return { email: data.email, name: data.name || '', state: data.state };
  } catch {
    // Network hiccup — keep the token, don't force a re-login over a blip.
    return null;
  }
}

// Kicks off the "forgot password" flow. Always resolves (never throws for a
// not-found email) since the server intentionally responds the same way
// either way, so the UI can't be used to check which emails have accounts.
export async function forgotPassword(email: string): Promise<void> {
  await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

// Completes a reset using the token from the emailed link (?resetToken=...).
export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await parseJsonSafely(res);
  if (!res.ok) throw new Error(data.error || 'Could not reset your password');
}

export async function logout(): Promise<void> {
  const token = getToken();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  if (token) {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // Best-effort — the client-side token is already cleared either way.
    }
  }
}
