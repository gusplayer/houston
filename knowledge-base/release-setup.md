# Release Setup (one-time)

Things the user must do once before the first signed release ships.
None of these can be automated from inside Squad because each needs a
TTY (keypair generation) or an external account (Apple, GitHub
Secrets).

## D.3 — Updater signing keypair

The Tauri auto-updater requires an Ed25519 keypair. The public key is
embedded in `tauri.conf.json` (already wired). The private key signs
each release's `.tar.gz` so installed clients can verify before
applying an update.

Generate one (TTY required for password prompt):

```bash
cd app
pnpm tauri signer generate -w ~/.squad-updater-key
```

It prints two values:

- **Public key** — replace the placeholder in
  `app/src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
- **Private key** — contents of `~/.squad-updater-key`. Add as the
  `TAURI_SIGNING_PRIVATE_KEY` GitHub Secret.
- **Password** — add as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Dev mode skips the updater entirely (see `app/src/hooks/use-update-
checker.ts`), so missing keys don't break the dev loop. The check
only fires for production builds.

## Apple signing (optional)

CI builds an unsigned DMG when Apple secrets aren't present. Users see
a Gatekeeper warning on first launch. To produce a notarized DMG:

| Secret | What |
|--------|------|
| `APPLE_CERTIFICATE` | Base64 of a Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAM_ID)` |
| `APPLE_API_KEY` | App Store Connect key id |
| `APPLE_API_ISSUER` | issuer UUID |
| `APPLE_API_KEY_CONTENT` | Base64 of the `.p8` key file |

Every signing step in `.github/workflows/release.yml` is gated on
`if: ${{ secrets.APPLE_CERTIFICATE != '' }}` so adding any subset is
safe — only the steps with matching secrets run.

## Telemetry + auth (optional)

Squad's PostHog, Supabase, Sentry, and Linear integrations are
dormant by default. Wire them up by setting the matching
`{POSTHOG,SUPABASE,SENTRY,LINEAR}_*` secrets in GitHub. See
`knowledge-base/production-infra.md` for the full table.
