# Coin top-ups via the Payment Hub

This game buys and sells nothing on its own. Real-money coin top-ups go through
a separate **Payment Hub** service, which is the only thing that ever holds a
real Paystack secret key. This game only ever talks to the hub's API.

```
Browser ──► This game's server ──► Payment Hub ──► Paystack
                                          ▲
                          Paystack webhook comes back here only
```

## How a top-up works

1. Player picks an amount and enters an email in the Wallet card (Earn tab).
2. The frontend calls this game's own server: `POST /api/wallet/topup/initialize`.
3. The server calls the hub's `POST /api/v1/transaction/initialize`, signed
   with this game's `HUB_API_KEY`/`HUB_API_SECRET` (see `server/paymentHub.js`).
   The hub starts the checkout on Paystack and returns an `authorizationUrl`.
4. The browser is redirected to that URL — Paystack's own hosted checkout page.
5. Once the player pays, Paystack redirects the browser to the hub, which
   verifies the payment and forwards the browser back to **this game's own
   site** with `?reference=...&status=...` appended.
6. The frontend (`WalletScreen.tsx`) sees `reference` in the URL and calls
   `POST /api/wallet/topup/verify`, which asks the hub to confirm the payment
   (the hub re-checks with Paystack) before crediting coins. A reference can
   only ever be credited once (`isPaymentProcessed`/`markPaymentProcessed` in
   `server/db.js`).
7. As a backup, the hub also proactively POSTs a signed webhook to this game's
   `POST /webhooks/hub` as soon as Paystack confirms the charge, in case the
   player closes the tab before step 6 happens. Same idempotency guard applies.

This game's server never sees a Paystack key, and the browser never sees this
game's hub credentials — the HMAC signing in step 3 happens entirely
server-side in `server/paymentHub.js`.

## Setup

1. Deploy the Payment Hub (separate repo/service) — see its own README.
2. Register this game as a merchant on that hub:
   ```bash
   HUB_URL=https://<your-hub>.up.railway.app \
   ADMIN_API_KEY=<your hub's admin key> \
   node src/scripts/createMerchant.js "hamster-kombat" "https://<this-game>/webhooks/hub"
   ```
   This prints an `apiKey`/`apiSecret` pair **once** — copy them into this
   game's environment right away (see `.env.example`).
3. Set these on this game's deployment (Railway service variables, or a local
   `.env`):
   - `HUB_URL` — the hub's own public URL
   - `HUB_API_KEY` / `HUB_API_SECRET` — from step 2
   - `APP_PUBLIC_URL` — this game's own public URL (used to build the
     `redirectUrl` the hub sends the player back to)

Without these three set, top-ups fall back to a clearly-labeled **DEMO mode**:
the server credits coins immediately without touching the hub or Paystack at
all, purely so the flow is testable locally. Never leave demo mode on in a
real deployment — anyone could top up for free.

## Persistence

The record of which payment references have already been credited (so a
reference can never be double-credited) lives in the same file as game state,
at `/data/db.json`. Make sure `/data` is a mounted volume in production — see
`DATA.md` — or that guard resets on every redeploy/restart.

## Relevant files

- `server/paymentHub.js` — signs and sends requests to the hub.
- `server/index.js` — `/api/wallet/topup/initialize`, `/api/wallet/topup/verify`, `/webhooks/hub`.
- `src/screens/WalletScreen.tsx` — the top-up UI, embedded in the Earn tab.
- `src/api.ts` — `initializeTopUp`, `verifyTopUp`.
