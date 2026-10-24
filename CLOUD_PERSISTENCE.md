# Cloud persistence rollout

## Current implementation: Clipping Studio metadata only

The browser talks to authenticated `/api/clipping-studio/projects` routes, not
directly to D1. SQL and tokens remain server-side. Project snapshots include
clips, recipes and export metadata. D1 queries scope all operations by the
authenticated owner; ID-conflict updates cannot transfer ownership.

Metadata alone is **not complete media persistence**. The opt-in private media
integration below covers selected upload/output/download and hydration paths;
live R2 and full restart/redeploy workflows remain unverified. Clip Finder/Reel
Maker cloud documents, export recovery and durable deletion are still pending.

## Activation is intentionally off

No remote migration, cloud object upload, resource creation, credential change or
plan upgrade was performed by this implementation.

After database backup/review, apply the additive migration to the intended D1
database (explicitly select local vs remote; do not run blindly):

`src/lib/cloudflare/migrations/0001_project_documents.sql`

It creates `project_documents` and an owner index only. It does not alter,
reassign or delete legacy tables/data. Requires the existing `users` table.

Then configure the server only:

```ini
CLOUD_PROJECT_METADATA_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-database-id
CLOUDFLARE_API_TOKEN=your-private-d1-token
```

Do not use `NEXT_PUBLIC_` for these credentials. Without the explicit flag and
credentials, API responses state that metadata sync is disabled. Configured
cloud failures return an error, not a false successful local fallback.

## Next storage work

1. Validate the new private S3 adapter against a private bucket only after
   reviewing migrations, credentials, quotas and billing controls.
2. Complete recovery of all editor documents and owner manifests.
3. Verify hydration through every processing entry point; some flows may still
   require a private preview first. New clipping snapshots now use portable
   references rebound to the current server cache root. Legacy default-storage
   Windows paths are also rebound; custom-root legacy paths may need relinking.
4. Restore project documents for all editors and reconcile export states.
5. Validate the opt-in deletion/inventory implementation below and complete
   deletion coverage for the other editors and legacy objects.
6. Verify two-user isolation and restart/redeploy recovery with real cloud storage.

R2 S3 compatibility: https://developers.cloudflare.com/r2/api/s3/api/
D1 limits: https://developers.cloudflare.com/d1/platform/limits/

## Actual verification

See `tests/cloud_project_documents.test.ts`: runs the additive SQL against an
in-memory SQLite database, uses mocked HTTP transport, and tests tenant
isolation, ownership conflict, owner-scoped deletion, disabled mode and cloud
failure responses. No live Cloudflare connectivity or media recovery is implied.

## Private media integration (off by default)

Added exact runtime dependency `@aws-sdk/client-s3@3.1156.0`. The new
`private-r2.ts` adapter uses the supported S3 endpoint and separate S3 credentials.
The old unused `r2.ts` helper is not used by this path. No anonymous object route,
public bucket URL or browser credential is introduced.

After database backup/review, explicitly apply migration
`src/lib/cloudflare/migrations/0002_private_media.sql`. Then configure only on
the server (never paste real keys into chat or Git):

```ini
CLOUD_PRIVATE_MEDIA_ENABLED=true
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_BUCKET_NAME=your-private-bucket
R2_ACCESS_KEY_ID=your-private-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-private-r2-secret-access-key
```

Existing D1 credentials are also required. Keep the bucket private and use
bucket-scoped object credentials. Example/Render flags default to false;
`.env.local` was not changed. No live migration/upload/resource was performed.

Implemented: opt-in backup hooks for Caption Maker uploads/companion audio,
Clipping imports/relinks/exports, bridge outputs, trimmed audio, caption video
renders, subtitles and generated covers. Catalog entries bind relative paths
to owner, random object key, byte count and SHA-256. Limit: 500 MB per object.
Authenticated downloads can restore files and asset/project owner records;
probe, structured export sources and caption render/transcribe/trim have
hydration hooks. Supported namespaces: caption-maker and clipping-studio only.
Main Clip Finder `projects/` files are not covered yet.

Restore checks actual filesystem paths, streams to a temporary file and verifies
size/hash before rename. Corrupt partials are removed. Failed catalog writes
attempt rollback of only the newly uploaded random-key object; local media stays.

Pending: live SDK/cloud verification, complete editor/job recovery, deletion
coverage outside Clipping Studio, quotas/rate limiting, cross-host paths and
Linux tests. Repeated backups create new objects; the opt-in inventory below
now tracks new objects so superseded uploads can be cleaned safely.

`tests/private_media_cloud.test.ts` passed with real SQLite catalog SQL and an
in-memory object-store fake: backup, loss of the whole cache, owner-aware restore,
corruption rejection, partial cleanup, traversal denial and failure rollback.
Production build, TypeScript and targeted new-module lint checks also passed.
This does not prove live R2 uploads or Render restart recovery.

Dependency triage reduced npm audit from 11 alerts to 0 using scoped nested
overrides, without changing framework versions. Node's built-in Undici remains
a separate runtime security gate; see DEPENDENCY_SECURITY.md.

## Durable deletion and bounded cleanup (off by default)

After reviewing/backing up the intended database, explicitly apply
`src/lib/cloudflare/migrations/0003_media_lifecycle.sql`, then enable only on the
server with `CLOUD_MEDIA_LIFECYCLE_ENABLED=true`. No live migration or cleanup
was executed in development. All three cloud flags remain false in templates.

- Every new backup first registers its randomized key in durable inventory.
  Current `private_media` catalog references are excluded from cleanup.
- Clipping project deletion validates ownership, checks persisted shared media
  references, writes a durable tombstone to fence save/restore/recreation, queues
  legacy catalog keys, removes owned metadata and then removes owned local data.
  Failures can be retried. Cloud deletion refuses to run without lifecycle config.
- UI local cache/crash snapshots are removed only after server confirmation.
  Name-based automatic deletion of legacy projects was removed.
- Physical object removal is separate and explicit: admin-only POST
  `/api/admin/media-cleanup` defaults to dry-run, max 10 candidates, with a one-hour
  grace period. `{"dryRun":false,"limit":10}` performs deletion only for
  unreferenced, owner-prefixed keys; failures retain inventory for retry.
- No timer, recurring job or cloud scheduler was created. Until maintenance is
  explicitly run, queued/superseded objects can continue consuming storage.

SQL/mocked-object tests cover dry-run, active-object protection, failure/retry,
another owner's deletion denial, saved shared-reference protection, deletion
tombstones and re-save/restore denial. Real D1/R2 and concurrent multi-instance
operations remain unverified. References existing only in browser caches and
untracked pre-migration orphan objects are not fully covered by this mechanism.
