# Social publishing fixes and verification — 2026-10-24

These are local code changes. No commit, push, deployment, live D1 migration,
Cloudflare subscription or real social publication was performed during this work.

## Reviewed issues addressed

1. OAuth callbacks require an authenticated session and an unpredictable state
   matching the initiating account/platform. A private HttpOnly, SameSite=Lax cookie
   carries the browser state; a server nonce file makes it single-use. Both expire
   after ten minutes. Return URLs must be local paths. Restarting this single-server
   app during OAuth requires reconnecting; nonce files are deliberately temporary.
2. Publishing only accepts relative storage paths with supported media extensions.
   Real paths, symlinks and existing ownership rules are checked before probing or
   streaming. Direct YouTube/Facebook uploader calls also enforce ownership.
3. Only administrators can save shared developer app credentials. Cross-origin
   mutation requests are rejected. Saved client secrets are encrypted and writes
   are atomic; storage errors are reported instead of returning false success.
   Non-admin users see an administrator configuration message.
4. Production token encryption and ingest signatures require a stable secret of
   at least 32 characters. The public development key is never a production fallback.
5. Video and cover ingest URLs have path/account-bound HMAC signatures and a
   two-hour expiry. The files route verifies signatures, expiry and ownership,
   including private-media restoration. Byte-range streaming remains supported.
   Files remain private; no public R2 bucket URL is assumed.
6. Original publishing overrides are saved with job metadata. YouTube retries
   preserve privacy, audience and tags. Legacy jobs without original YouTube
   privacy settings require a new explicitly configured request. Atomic retry
   claims prevent simultaneous retry clicks from starting duplicate uploads.
7. When D1 is configured, publishing history, reads, progress and final job status
   all use D1. Cloud failures fail closed rather than returning stale local copies.
   Jobs are kept in a preparation state until platform records have been saved.
   The existing video_metadata JSON stores options/origin without another migration.
8. Direct publishing reads the actual platforms response field. Group progress
   waits for all target records; partial failure is reported. Completed/partial
   modal jobs stop polling, and closed modals stop polling.
9. Video listing and dispatch use FFprobe for real duration/resolution/size and
   validate actual media before queueing. Client-supplied metadata is not trusted.
10. Fresh covers and bundled-sample cleanup keep badge text empty and badges OFF.
    Explicit user selections are retained; toggling a badge ON may suggest copy.
    Existing custom badge padding is no longer silently rewritten.

## Worker and restart behavior

The Node server starts a polling worker through src/instrumentation.ts. Pending
platform records are saved before execution and claimed atomically. After a restart,
pending records are resumed from D1 or a persistent local storage directory. External
API calls have a 60-second per-request timeout. Polling runs every 30 seconds.

An upload interrupted after contacting a remote platform has an uncertain outcome.
After ten minutes without progress it becomes failed with an explicit instruction
to inspect the platform before retrying. It is never automatically resent. This is
not a promise of exactly-once publishing across third-party APIs.

Without D1, local JSON is suitable for local development or a persistent single
server disk. Render Free's ephemeral disk is not durable storage. D1 persists job
metadata, not video bytes. R2/private-media configuration or another durable media
store is still needed to retain uploaded files across instance replacement.

## Before enabling production publishing

- Apply src/lib/cloudflare/migrations/0004_social_publishing.sql to the intended
  D1 database after review; no live schema was changed here.
- Set OAUTH_ENCRYPTION_KEY to a randomly generated value of at least 32 characters
  and keep it stable across deployments. Never commit it. AUTH_SECRET of sufficient
  length is supported as a fallback, but a separate publishing key is preferred.
- Existing tokens encrypted with the old public development key must be reconnected
  in production. Changing a valid encryption key also requires reconnecting accounts.
- Prefer environment variables for developer app credentials. Existing plaintext
  credential files are read for compatibility; resaving encrypts their secrets.
  Use environment configuration on ephemeral hosts because that file is local.
- Configure the appropriate developer apps, permissions and callback URLs. Social
  publishing callbacks are separate from Google sign-in callbacks:
  /api/social-publishing/oauth/{youtube|instagram|facebook|threads}/callback.
- Set AUTH_URL to the deployed origin and configure private durable media storage.
  OAuth nonce files assume one server instance; use shared nonce storage before
  horizontally scaling this implementation.

## Actual local verification

- Node 24.22.1, npm 11.19.1.
- npm run typecheck: passed.
- npm run build: passed, including new publishing routes and instrumentation.
- npm run verify:server: all 20 regression suites passed in temporary storage.
- New npm run test:publishing-security checks real FFmpeg-generated video metadata,
  traversal/cross-account denial, signed HTTP range downloads, signature tampering,
  OAuth expiry/replay/owner binding, production secret enforcement and non-admin
  credential rejection.
- The same suite runs publishing SQL against in-memory SQLite behind a mocked D1
  HTTP interface. It verifies reads after deleting local cache, private retry upload
  payloads, audience settings, concurrent retry claims, stale-job handling, user
  isolation, history completion and progress response handling.
- Pipeline tests use actual small video fixtures and test-only publisher simulation.
  Simulation branches require NODE_ENV=test and cannot claim production success.
- Existing auth, media, clipping, cloud backup/lifecycle, account cache, caption
  truthfulness, social rules and CTA suites also passed.

Not performed: real Google/Meta/Threads authorization or publications, live D1/R2
checks, new Linux container verification, or desktop/tablet/mobile browser testing.
Local tests do not establish platform approval, quota availability or durable storage
configuration on the deployed service. Existing platform limit reference values were
not independently revalidated against live documentation in this change.

## Local and live runtime follow-up

- Local development now chooses the actual loopback hostname/port for sign-in,
  CSRF checks and publishing callbacks, even if AUTH_URL still contains a live URL.
  Both local callback URLs must still be registered with the relevant provider.
- Production pins AUTH_URL when configured. On Render, RENDER_EXTERNAL_URL is
  automatically used when AUTH_URL is absent. Untrusted request hosts and loopback
  production origins are rejected. Custom domains should continue to set AUTH_URL.
- New local tokens use a random key generated once in storage/.publishing-secret,
  reused after process restarts. The v2 token format distinguishes this encryption
  from legacy development tokens, which remain readable locally. Production never
  falls back to the development key/file. Keep a stable key when sharing a D1
  database across environments; preferably use separate local/live databases.
  Local D1 publishing without an explicit shared key is blocked to prevent saving
  tokens that the live service cannot decrypt.
- render.yaml uses generateValue:true for OAUTH_ENCRYPTION_KEY and enables the
  remote-host gate for the authenticated app. This configures future Blueprint
  deployments, not an existing manually created service. Existing secrets are not
  rotated. No live Render environment was changed in this work.
- The Node publishing worker starts automatically in development and production.
  Authenticated `/api/social-publishing/status` and admin `/api/system` report
  configuration gaps without exposing secrets. Startup emits the same missing
  setup messages. These checks do not claim to verify credentials or migrations.
- Additional tests cover localhost and 127.0.0.1, local key reuse in a separate
  process, legacy tokens, production HTTPS/key rejection, Render URL detection and
  provider callback construction. All 21 regression suites passed. TypeScript and
  the production build passed, and the isolated production HTTP smoke test passed.
- `npm run test:runtime:http` starts an isolated real production Node HTTP server
  with fixture credentials and temporary storage. It verifies both main pages,
  account registration/session/logout, secure cookie flags, callback URL generation,
  CSRF rejection, honest missing-storage diagnostics and automatic processing of a
  persisted pending job at startup. Provider requests are not followed. This is a
  production-mode smoke test on loopback, not verification of the deployed website
  or browser HTTPS cookie transport.

One-time external requirements remain: developer app approval/callback registration,
valid provider secrets, D1 schema and private durable media storage. They are not
automatically provisioned or billed by app startup. Render Free sleeping/replacement
and remote provider outages still affect availability. Test and build results do not
constitute a guarantee of always-on operation.

References for the Render automation:
- https://render.com/docs/environment-variables (RENDER_EXTERNAL_URL)
- https://render.com/docs/blueprint-spec#generating-random-secrets (generateValue)
