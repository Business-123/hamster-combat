# Persistent data

All game state — user balances, purchases, and (importantly) the record of
which payment references have already been credited — lives in a single JSON
file, written by `server/db.js`.

By default it's written to **`/data/db.json`**. On Railway, without a mounted
volume, `/data` is just part of the container's disk and gets wiped on every
redeploy — every player would lose their progress, and worse, the record of
already-processed payments would reset too (see "Why this matters for
payments" below).

## Set it up on Railway

1. Open this game's service on Railway → **Settings → Volumes**.
2. Add a volume, mount path: `/data`.
3. Deploy. No environment variable or code change needed — `server/db.js`
   writes to `/data/db.json` automatically whenever `/data` exists and is
   writable.

That's it — nothing else reads or writes `/data`.

## Local development

You don't need a volume locally. `server/db.js` tries `/data` first and, if
it isn't writable (the normal case on a dev machine without root), falls back
automatically to `./data/db.json` inside the project folder, with a one-time
console warning. Nothing to configure.

If you want to force a specific location (e.g. to test the fallback, or to
point at a different mounted path), set:

```
DATA_DIR=/some/other/path
```

## Why this matters for payments

`server/db.js` also stores `processedPayments`, keyed by payment reference —
this is what stops a single successful payment from being credited twice
(`isPaymentProcessed`/`markPaymentProcessed`, used by both
`/api/wallet/topup/verify` and `/webhooks/hub` in `server/index.js`, see
`PAYMENTS.md`). If this file isn't on a persistent volume and the container
restarts between a payment completing and its reference being re-checked,
that guard resets — a stale `?reference=...` redirect or a retried webhook
could credit coins a second time for the same real-world payment. Mounting
`/data` as described above avoids that.
