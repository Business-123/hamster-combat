# Login system (email + password)

The game has real accounts, not an anonymous per-browser ID — every player
must sign up or log in before playing.

## How it works

- `POST /api/auth/signup` — `{ email, password, guestUserId? }`. Hashes the
  password with scrypt (`server/auth.js`) and stores the account in
  `db.json` under `accounts`, keyed by lower-cased email. Returns a bearer
  `token` plus the player's current game state.
- `POST /api/auth/login` — `{ email, password }`. Verifies the password and
  returns a new bearer `token`.
- `GET /api/auth/session` — `Authorization: Bearer <token>`. Used on app
  load to silently restore a session without re-sending the password.
- `POST /api/auth/logout` — `Authorization: Bearer <token>`. Deletes the
  session server-side.
- `POST /api/auth/forgot-password` — `{ email }`. Always responds `{ ok:
  true }` whether or not the email has an account (so it can't be used to
  enumerate registered emails). If it does, emails a link containing a
  random, single-use, 30-minute reset token.
- `POST /api/auth/reset-password` — `{ token, password }`. Validates the
  token from that link and overwrites the account's password hash.

Sessions are simple random tokens stored in `db.json` under `sessions`,
mapped to a `userId`. **Every existing game route is untouched** — they all
still key off `x-user-id` the same way they always did. The login system's
only job is deciding *which* `userId` ends up in `localStorage` under the
same key (`hamster-kombat-user-id`) that `src/api.ts` already reads. That's
why nothing else in `server/index.js` needed to change.

## Guest progress isn't lost on signup

If the browser already has an anonymous save (e.g. from before this account
system existed, or a leftover `hamster-kombat-user-id`), `signup` accepts a
`guestUserId`. If that id already has game state and isn't already claimed
by a different account, the new account is attached to that same `userId`
instead of starting over — so points/characters/tasks carry across
automatically. See `isUserIdClaimed` / the `guestUserId` handling in
`server/index.js`.

## Forgot / reset password

- `src/screens/AuthScreen.tsx` has a "Forgot password?" link on the login
  form. It posts to `/api/auth/forgot-password`, which emails a link like
  `<APP_PUBLIC_URL>/?resetToken=<random-token>` (via `server/email.js`,
  same DEMO-mode console-log fallback as the purchase-receipt email when
  SMTP isn't configured).
- Opening that link routes `AuthScreen` straight to a "set a new password"
  form (`src/App.tsx` reads `?resetToken=` and passes it down), which posts
  the new password + token to `/api/auth/reset-password`.
- Tokens live in `db.json` under `resetTokens`, are single-use (deleted on
  success), and expire after 30 minutes (`RESET_TOKEN_TTL_MS` in
  `server/index.js`).

## Admin: resetting a player's password

Real passwords are never stored anywhere — only the scrypt hash — so there
is no way for the admin panel to display a player's actual password. If a
player is locked out and hasn't set up email reset (or the reset email
isn't reaching them), the Users tab in `public/admin.html` has a **Reset
password** button per row (only shown for players who have an email/
password account). It calls `POST /api/admin/users/:userId/reset-password`,
which:

1. Generates a random temporary password.
2. Hashes it and overwrites the account's stored hash.
3. Returns the plaintext temp password **once**, shown to the admin via a
   one-time prompt — it is never written to `db.json`, logged, or
   retrievable again.

The admin relays that temp password to the player out-of-band; they should
change it (or use "Forgot password?") after logging in.

## Frontend

- `src/auth.ts` — `signup`, `login`, `restoreSession`, `logout`,
  `forgotPassword`, `resetPassword`.
- `src/screens/AuthScreen.tsx` — the login/signup form (show/hide password
  toggle, password-strength hint on signup), the "forgot password" request
  form, and the "set new password" form used when opened from a reset link.
- `src/components/ProfileMenu.tsx` — small account menu (top-right) with
  logout.
- `src/App.tsx` gates the whole app behind `AuthScreen` unless there's a
  valid stored session — there's no guest/anonymous mode, and no path to
  play without an account.

## Security notes

- Passwords are never stored in plaintext — only `scrypt(password, salt)` —
  and there is intentionally no code path anywhere (including the admin
  panel) that can recover or display a player's real password.
- Password comparison uses `crypto.timingSafeEqual` to avoid timing attacks.
- Session tokens and reset tokens are both 32 random bytes (256 bits) of
  entropy, not guessable.
- Reset tokens are single-use and expire after 30 minutes.
- `forgot-password` responds identically regardless of whether the email is
  registered, to avoid leaking which emails have accounts.
- There's still no email *verification* step at signup — email is trusted
  as entered. Consider adding that before a real public launch.
- Like the rest of the app's state, accounts/sessions/reset tokens live in
  `db.json` — see `DATA.md` for why that needs a persistent volume in
  production.

