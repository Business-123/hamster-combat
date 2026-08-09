# Admin-managed game settings

The admin portal (`/admin`) now has a **Settings** tab that controls every
game economy number and the full character/task rosters — changes apply
immediately to every player, no redeploy needed.

## What you can manage

**Mining & economy**
- Coins per tap
- Base mining rate (coins/hour, before a character's multiplier)
- Coins per GH₵1 (the purchase exchange rate)
- Minimum withdrawal (GH₵)
- Quick top-up amount buttons shown in the Wallet tab
- Referral bonuses (referrer / new friend)
- Daily reward / cipher / combo bonus amounts

**Characters** (Character tab roster)
- Name, rank, price, mining-speed multiplier
- Image URL — paste any image link and it replaces the default hamster
  artwork everywhere that character appears (Character tab grid + the
  hamster on the Mine screen when equipped). Leave blank to keep the
  default art, tinted with the gradient/glow colors you set.
- Add new characters or delete existing ones (at least one must remain)

**Tasks** (Earn tab roster)
- Title, coin reward, link URL
- Add new tasks or delete existing ones
- The "Connect a TON wallet" task is wired to the wallet-connect button —
  keep its id as `connect-wallet` if you edit it instead of deleting/
  recreating it

## How it works

- All of this lives in `server/settings.js`, persisted in the same
  `db.json` as everything else (see `DATA.md` — mount `/data` as a volume
  in production so it survives redeploys).
- `server/game.js` reads these values live on every request, so an admin
  edit takes effect immediately for every player already in the app.
- New admin API routes (all require the `x-admin-key` header, same as the
  existing withdrawal/user endpoints):
  - `GET /api/admin/settings` — everything above, in one payload
  - `PUT /api/admin/settings` — update the single-value settings (mining
    rate, exchange rate, min withdrawal, referral/daily bonuses, top-up
    presets)
  - `POST /api/admin/characters` — create (omit `id`) or update (include
    `id`) a character
  - `DELETE /api/admin/characters/:id` — remove a character
  - `POST /api/admin/tasks` — create (omit `id`) or update (include `id`)
    a task
  - `DELETE /api/admin/tasks/:id` — remove a task

## Frontend changes

- The Wallet tab's exchange rate and quick top-up buttons now come from
  the server (`state.pointsPerGhs` / `state.topupPresetsGhs`) instead of
  hardcoded constants.
- The Character tab and the Mine screen's equipped-hamster art both read
  each character's `image`/`gradient`/`glow` from the server instead of a
  fixed, code-only lookup table — so a character you rename, re-price, or
  give new art to in the admin panel shows up correctly everywhere in the
  app immediately.

## Notes

- Deleting a character doesn't take it away from players who already own
  it — it just stops being purchasable/listed going forward.
- If you change the mining rate or a character's multiplier, currently
  playing users get the new rate applied to future accrual — it does not
  retroactively rewrite coins they've already earned.
