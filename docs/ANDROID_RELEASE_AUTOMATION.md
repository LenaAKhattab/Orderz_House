# OrderzHouse — development & release automation

Windows dev PC, repo `C:\Dev\Orderz_House`. Every command is `node scripts/oh.mjs <command>`.
Nothing in this document is a secret; credential **locations** are listed, never values.

## Commands

| Command | Effect | Gate |
|---|---|---|
| `doctor` | toolchain, logins, key/config presence, git state | read-only |
| `test:backend` / `test:frontend` / `test:flutter` | unit test suites | local |
| `test:staging` | backend integration tests on the Staging DB (refuses Production via `assertStagingQaTarget`) | Staging writes |
| `android:build` | `flutter build appbundle --release` → `artifacts/android/orderzhouse-<ver>+<code>-release.aab` + `.sha256` + verification | local |
| `android:verify [--aab f] [--sha256 x]` | sha256, upload cert, package, versionCode, Firebase resources, release API URL, secret scan | read-only |
| `play:status` | Play tracks, releases, uploaded bundles (temporary edit, discarded) | read-only |
| `play:internal [--validate-only \| --commit] [--notes-en ..] [--notes-ar ..]` | upload to **internal** track; without a flag it only plans | explicit flag |
| `prod:health` | public health + VPS HEAD / containers / runtime parity with origin/main | read-only |
| `prod:deploy --sha <40-char> --confirm-production [--migrations "221_x 222_y"] [--services "backend"]` | detached deploy on the VPS via `scripts/deploy/orderzhouse-deploy.sh`, polled to `DEPLOY_DONE` | explicit flag |

Google Play **production** promotion is deliberately not automated: `orderzhouse-play.mjs` refuses the
`production` track and `play-release.config.json` allow-lists only `internal`.

## Android release flow

1. Bump `version:` in `mobile/orderzhouse_app/pubspec.yaml` (versionCode must exceed every code on Play).
2. `node scripts/oh.mjs test:flutter`
3. `node scripts/oh.mjs android:build` — Gradle itself fails a release build when
   `android/app/google-services.json` is missing, belongs to another project/package, or is a
   service-account key, and when the processed resources lack `google_app_id`.
4. `node scripts/oh.mjs play:status`
5. `node scripts/oh.mjs play:internal --notes-en "…" --notes-ar "…"` (plan) → `--validate-only` → `--commit`.
   The tool refuses a versionCode already on Play with a different sha256, a code not higher than the
   current maximum, and replacing draft/in-progress releases unless `--replace-pending` is passed.
   Uploads are resumable (8 MB chunks, resume after network errors); Play's sha256 is compared with the local file.
6. Install from the Play internal-testing link on a real device and run acceptance.
7. Public production rollout: owner decision, done manually in Play Console.

## Identities and credentials (locations only)

| What | Where | Notes |
|---|---|---|
| Company Google account | `battechno2017@gmail.com` (Chrome profile "bat", `Profile 15`) | Play Console, Google Cloud, Firebase `orderz-house` |
| gcloud login | `%APPDATA%\gcloud` (gcloud's own credential store) | `gcloud auth login battechno2017@gmail.com` |
| Play publishing identity | service account in `play-release.config.json` (`serviceAccountEmail`) | `orderzhouse-release-automation@orderzhouse-play-publisher.iam.gserviceaccount.com` in dedicated Cloud project `orderzhouse-play-publisher` (APIs: androidpublisher, iamcredentials, iam; no project roles). **Keyless**: only `battechno2017@gmail.com` holds `roles/iam.serviceAccountTokenCreator` on it; no JSON key exists. Play Console access: app `com.orderzhouse.app` only — "View app information" + "Release apps to testing tracks" |
| Android upload keystore | `mobile/orderzhouse_app/android/keystores/` + `android/key.properties` | git-ignored; cert SHA-256 pinned in `play-release.config.json` |
| Firebase Android client config | `mobile/orderzhouse_app/android/app/google-services.json` | git-ignored, not secret but project-specific |
| Firebase Admin (push sender) | VPS host file `/etc/orderzhouse/firebase-service-account.json`, mounted read-only | never copy to a PC or into the app |
| Production SSH | `~/.ssh/orderzhouse_vps_ed25519` (passphrase), loaded in the Windows `ssh-agent` service | host alias `orderzhouse-prod`; use Windows OpenSSH (`C:\Windows\System32\OpenSSH\ssh.exe`), Git-Bash ssh cannot see the agent |
| GitHub | `gh` keyring login `orderzhouse1` (HTTPS) | |
| Stripe test (Staging only) | `backend/.env.staging` via `backend/scripts/configureStagingStripeTest.js` | `--from-stripe-cli` or hidden prompt; refuses live keys |

### Revoking Play automation

- Play Console → Users and permissions → remove the service account (instant).
- Google Cloud → IAM → service account → remove `roles/iam.serviceAccountTokenCreator` for the user, or disable the account.
- `gcloud auth revoke battechno2017@gmail.com` on this PC.

### Never

- Use HAZBER (`com.hazber.*`) or M1YAT credentials/profiles, or any other project's service account.
- Commit or bundle `google-services.json`, keystores, `.env*`, service-account JSON (all git-ignored).
- Put live Stripe keys in Staging, or test against Production payments.
