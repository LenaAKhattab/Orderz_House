# OrderzHouse — instructions for Claude Code

Repo: `C:\Dev\Orderz_House` (backend Node/Express + Postgres/Neon, frontend Vite/React, Flutter app
`mobile/orderzhouse_app`, package `com.orderzhouse.app`). Arabic-first product; reports to the owner in Arabic.

## Automate, don't hand off

Everything below is already automated — run it instead of asking the owner. Full runbook:
`docs/ANDROID_RELEASE_AUTOMATION.md`.

```
node scripts/oh.mjs doctor            # first thing in a new session
node scripts/oh.mjs test:backend | test:frontend | test:flutter | test:staging
node scripts/oh.mjs android:build     # signed AAB + verification
node scripts/oh.mjs play:status       # Google Play, read-only
node scripts/oh.mjs play:internal --commit --notes-en "…" --notes-ar "…"
node scripts/oh.mjs prod:health
node scripts/oh.mjs prod:deploy --sha <full merged sha> --confirm-production [--migrations "…"]
```

Ask the owner only for: Google sign-in/MFA, a secret typed into a local hidden prompt, physical phone
access / USB-debugging authorization, legal declarations, and business decisions.

## Identities

- Company Google account: `battechno2017@gmail.com` (Chrome profile "bat"). Play Console developer
  "Bat Techno Company", app ORDERZHOUSE. Firebase project `orderz-house`.
- GitHub: `gh` login `orderzhouse1`, HTTPS remote. Branch → PR → `git merge --no-ff`, keep branches.
- NEVER use: HAZBER developer account / `com.hazber.*`, M1YAT service accounts or keys, other Chrome
  profiles, personal game credentials. Other projects on this PC (Bildazo etc.) own their emulators and
  adb sessions — do not kill the adb server or touch their AVDs; OrderzHouse uses AVD `Medium_Phone`.

## Production

- VPS `srv1528115` (alias `orderzhouse-prod`, user root, repo `/root/Orderz_House`, docker compose
  `docker-compose.yml` + `docker-compose.production.yml`, containers `orderzhouse-backend` /
  `orderzhouse-frontend`). `battechno-originality-api` on the same host is unrelated — never touch it.
- SSH from Windows OpenSSH only (agent service holds the passphrase-protected key). PowerShell strips
  embedded double quotes in remote commands: pipe a script file to `bash -s` instead.
- Deploys only from merged `origin/main`, via `prod:deploy` (detached, polled). Migrations are applied
  one at a time with `EXPECTED_MIGRATION_VERSION`. Mobile/docs/QA-script-only changes need no deploy
  (`prod:health` reports runtime parity).
- Production DB is read-only for ad-hoc work; never point local `.env` at Production.

## Staging vs Production

- `backend/.env` = APP_ENV=local → Staging DB, no Stripe. `backend/.env.staging` = Staging QA
  (`loadStagingQaEnv` + `assertStagingQaTarget`). Stripe on Staging: TEST keys only, via
  `backend/scripts/configureStagingStripeTest.js`.
- Never create real Production charges; never change Radar, financial policies, VAT, revenue split or
  employee reward gates (they need separate management approval).

## Android

- Release builds fail without a valid `google-services.json` (orderz-house / com.orderzhouse.app).
- Google Play: internal track only via the tool; production promotion is a manual owner gate after
  real-device acceptance. Never re-upload an existing versionCode.

## Secrets

Never print, commit, bundle or paste secrets. Credential locations (not values) are in the runbook.
Throwaway QA scripts stay untracked as `backend/scripts/_tmp*.js`.
