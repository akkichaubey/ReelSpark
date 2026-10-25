# Cloud persistence and server storage

## Current architecture

The Render service is a Next.js Node server. Its free-instance filesystem is
ephemeral, so `storage/` is a working cache, not durable storage. Authenticated
server routes use Cloudflare D1 for project metadata and a private Cloudflare R2
bucket for supported media. The bucket does not need public access.

- Clip Finder project manifests are stored owner-scoped in D1 and hydrate the
  local cache after a restart or deploy.
- Caption Maker, Clip Finder and supported Clipping Studio media are backed up
  to R2 with an owner-scoped catalog entry, random object key, size and SHA-256.
- Restores verify ownership and integrity before atomically writing to the local
  cache. Uploads are not reported as durable unless both the R2 object and D1
  catalog entry succeed.
- D1 tracks upload reservations, monthly app-side R2 request usage, delete
  tombstones, delayed cleanup entries and the bounded orphan-scan cursor.
- The server janitor handles known temporary files, failed uploads and interrupted
  Clip Finder work. Queued R2 cleanup is delayed and reference-checked.

## D1 migrations

Storage requires migrations `0001`, `0002`, `0003`, `0005`, `0006`, `0007` and
`0008` in `src/lib/cloudflare/migrations/`. Migration `0004` is for social
publishing and is separate. The storage migrations are additive; they do not
rewrite existing project records. Migrations `0007` and `0008` have been applied
to the configured D1 database and their tables were verified. Do not rerun
non-idempotent `0006` against an already migrated database.

Before connecting a different D1 database, back it up, review each migration,
then apply migrations in order using Wrangler or the Cloudflare D1 API. Confirm
that `users`, `project_documents`, `private_media`,
`private_media_upload_reservations`, `media_cleanup_queue`,
`deleted_clip_finder_projects`, and `media_cleanup_state` exist.

## Enablement

Set server-only environment variables in `.env.local` for local development and
in Render's Environment settings for production. Never expose credentials with
`NEXT_PUBLIC_` or commit `.env.local`.

```ini
CLOUD_PROJECT_METADATA_ENABLED=true
CLOUD_PRIVATE_MEDIA_ENABLED=true
CLOUD_MEDIA_LIFECYCLE_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_D1_DATABASE_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_R2_BUCKET_NAME=reelspark-storage
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

Use a private bucket-scoped R2 token and a D1 token limited to the required
database. Local and production environments may share D1/R2 if they use the same
credentials; that means both environments see the same account's saved projects
and media. Use a separate database and bucket to isolate development data.

Render's `render.yaml` enables cloud metadata, private media, lifecycle cleanup,
and local janitor defaults. At the last dashboard check, the live service had
private media enabled but `CLOUD_MEDIA_LIFECYCLE_ENABLED` was still `false`; the
cleanup flag needs to be enabled after the code deploy. The live service uses
the `codex/server-readiness` branch. Local `.env.local` currently has D1 access
but no R2 access keys, so local cloud-media flags remain off; local processing
still uses disk, but those local-only files do not survive a server restart.
Render Free has no persistent disk; local files that were not uploaded to R2
can disappear on restart or deploy.

## Storage limits and costs

ReelSpark stops its own R2 backup/restore requests at conservative app-side
thresholds: 8 GB stored, 800,000 Class A operations and 8,000,000 Class B
operations per month. The counters live in D1 and reset by month. Lower the
`CLOUD_R2_*_LIMIT` values to leave more headroom.

These limits only track ReelSpark's own requests and known objects. They cannot
see other Cloudflare applications or guarantee that the Cloudflare account will
never incur charges. Cloudflare usage notifications are warnings, not a hard
account-wide spend cap. Review Cloudflare's current R2 pricing and usage before
increasing limits. No billing plan or subscription is changed by this project.

## Cleanup behavior

- `STORAGE_CLEANUP_ENABLED=true` starts an in-process maintenance schedule when
  the Node server starts. Defaults: run hourly, retain recognized temp files for
  24 hours and require private-media orphans to be 30 days old.
- Active upload/render/export paths and known project references are excluded.
  Symlinks, unknown owners and failed reference inventories are not destructively
  cleaned.
- Project deletion writes an owner-checked D1 tombstone before removing the
  catalog/document. R2 deletion is queued and happens after a one-hour grace
  period, with reference checks immediately before physical deletion.
- The R2 orphan reconciler scans one bounded page per run and persists its
  continuation cursor in D1. It only considers old, exact-format app object keys
  that have no catalog row or active upload reservation.
- Render Free may suspend an idle service; the in-process timer cannot run while
  the service is asleep. Cleanup resumes on server startup/requests. A separate
  always-on scheduler would require a scheduled external worker/service.
- Temporary render files stay local and are not backed up. Successful final
  outputs remain in R2 only when a supported route explicitly backs them up.

The authenticated administrator endpoint `GET /api/admin/media-cleanup` reports
local storage categories and R2 cleanup status. `POST` defaults to dry-run;
physical cleanup must be explicitly requested by an administrator. Logs use the
`[Storage maintenance]` prefix.

## Verification

On 2026-10-25, `npm run typecheck`, `npm run build`, `npm run test:storage`,
`npm run test:private-media`, and `npx tsx tests/media_lifecycle.test.ts` passed.
The tests use a local SQLite fixture and a fake R2 adapter; they verify safe
cleanup, retry, owner isolation, project restoration after local-cache loss,
quotas, tombstones and media deletion. They do not simulate a real Render
restart or upload a file to the live R2 bucket. The live D1 table names were
read and the `0007`/`0008` schema was verified. Deployment of the current source
still requires a successful GitHub-to-Render deploy and a live app smoke check.

See [STORAGE_LIFECYCLE.md](STORAGE_LIFECYCLE.md) for cleanup operations and
`tests/` for the test coverage.
