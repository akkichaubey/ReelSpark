# Deployment handoff — 2026-10-24

## Completed locally

- Patched nvm Node 24.22.1 and version guards; production build/tests pass.
- Tenant-scoped authentication, private media preparation, structured exports,
  metadata snapshots and opt-in tombstone/object cleanup.
- Clipping snapshots now store portable media/output references and resolve them
  against the current server's storage root. Default-storage legacy Windows paths
  are rebound; arbitrary external paths are not converted into authorized media.
- Confirmed cloud-deleted IDs remove stale copies from the matching account's
  browser project cache during metadata refresh, rather than resurrecting them.
- Unified `npm run verify:server -- --real` runner (13 suites).
- Linux Docker/Hindi-render workflow in `.github/workflows/linux-verify.yml`.
  Checkout action is commit-pinned; token permission is read-only; credentials
  are not persisted. The verification branch was pushed; no cloud deployment ran.
- Git/Docker ignore rules protect all real `.env*` files, preserving the example.

## Actual external checks

- Existing D1 credentials successfully performed a read-only schema query.
- `users` exists; `project_documents`, `private_media`,
  `deleted_clipping_projects` and `media_cleanup_queue` do not exist yet.
- Google client ID/secret and AUTH_URL are absent from local configuration.
- Private R2 bucket name/access key/secret are absent.
- All cloud activation flags remain false. No migration or bucket operation ran.
- GitHub repository is public and the connected account has admin/push access.
  Current token did not match the examined `.env.example` history in origin/main;
  this limited check is not a complete secret-history audit or proof of rotation.
- Docker/Podman are unavailable; WSL reports it is not installed. No system
  installation was attempted. GitHub-hosted Linux verification passed on commit
  `d35083265521c965e73a5ef9158d4c1189b374b6`:
  https://github.com/akkichaubey/ReelSpark/actions/runs/40069044763.
  The actual Docker image build, all 13 regression suites, production dependency
  audit and Hindi-captioned Chromium render passed. This does not verify live
  Google/R2/D1 persistence, Hindi visual quality, or Render Free memory capacity.
- Render sign-in and GitHub repository connection were verified. With explicit
  public-preview approval, Free Docker service `srv-dbe4rgbrjlhs7391t7l0` was
  created from `codex/server-readiness` (commit d350832).
  Assigned URL: https://reelspark-b7d8.onrender.com.
  Docker build and startup passed. Render logged "Your service is live" for
  deployment `dep-dbe4sg4s728c73960r7g`. Public smoke checks: `/` HTTP 200;
  `/api/auth/providers` HTTP 200 with google=false; `/api/projects` HTTP 401
  without authentication. Browser landing page and sign-in dialog rendered;
  Continue with Google is disabled as expected without credentials.
  AUTH_URL uses the assigned HTTPS origin and REELSPARK_ALLOW_REMOTE=true permits
  the approved public preview. Demo login and all cloud activation flags stay false.
  Google OAuth credentials have now been saved in Render and ignored local
  `.env.local` with user approval. D1/R2 secrets are not configured on Render.
  Both local and hosted provider endpoints return google=true; flow initiation
  redirects to Google with the correct per-environment callback. Real sign-in
  passed on the hosted browser through Google consent and the authenticated
  dashboard. Durable session storage remains unverified. D1 `users` and `sessions`
  were confirmed with a read-only query; credential transfer to Render is pending.
  See GOOGLE_SIGN_IN.md.
- Production landing copy still advertises admin/admin demo access and private
  local processing. This copy is inconsistent with the disabled demo setting and
  server preview deployment; correct before launch. No real login, upload/export,
  durable media recovery or multi-user end-to-end test has passed on Render yet.

## External input/authority needed

1. Configure Google OAuth and a private R2 bucket with bucket-scoped credentials
   through the relevant account consoles. Keep secrets in `.env.local`/hosting
   secrets, never in chat or Git. OAuth consent/login may require the account owner.
2. Review/backup the intended D1 database before explicitly applying migrations
   0001–0003. Missing tables must not be mistaken for working persistence.
3. The reviewed changes are published on `codex/server-readiness`; Linux CI passed.
   A Render Free preview has been created from this branch. Main/development were
   not changed by this push. Auto-deploy is configured after CI checks pass.
4. Choose the administrator identity and confirm production HTTPS hostname once
   the hosting service exists. No account was automatically promoted.
5. Verify real cloud recovery, remaining editor persistence/AI provider gaps,
   quotas, multi-user browser flows and Linux resource requirements before launch.

`npm run deploy:preflight` reports configuration booleans only and intentionally
returns failure while production values/flags are absent. It does not apply
migrations, enable services, create resources or validate live media recovery.

The Render service remains Free/preview-only; no paid service was created. A free
preview is not a guarantee that every video rendering workload fits its resource
limits. Authentication, database and object-store activation remain incomplete.
