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
- Manual Linux Docker/Hindi-render workflow in `.github/workflows/linux-verify.yml`.
  Checkout action is commit-pinned; token permission is read-only; credentials
  are not persisted. No push, dispatch or cloud deployment was performed.
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
  installation was attempted. The Linux workflow has NOT run or passed yet.

## External input/authority needed

1. Configure Google OAuth and a private R2 bucket with bucket-scoped credentials
   through the relevant account consoles. Keep secrets in `.env.local`/hosting
   secrets, never in chat or Git. OAuth consent/login may require the account owner.
2. Review/backup the intended D1 database before explicitly applying migrations
   0001–0003. Missing tables must not be mistaken for working persistence.
3. Approve the publication of the reviewed changes to the public GitHub repository
   before pushing/dispatching Linux CI. Check Actions usage limits first.
4. Choose the administrator identity and confirm production HTTPS hostname once
   the hosting service exists. No account was automatically promoted.
5. Verify real cloud recovery, remaining editor persistence/AI provider gaps,
   quotas, multi-user browser flows and Linux resource requirements before launch.

`npm run deploy:preflight` reports configuration booleans only and intentionally
returns failure while production values/flags are absent. It does not apply
migrations, enable services, create resources or validate live media recovery.

The Render Blueprint remains Free/preview-only. No paid service or public app
deployment has been created. A free preview is not a guarantee that every video
rendering workload fits its resource limits.
