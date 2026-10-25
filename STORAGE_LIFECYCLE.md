# Storage lifecycle management

ReelSpark streams large uploads to disk, writes them to staging paths, and only
publishes a file after validation succeeds. Failed streams remove partial files;
uploads carry an owner-scoped cancellation ID so a cancel action can stop server
work as well as the browser request. The server janitor recovers interrupted Clip
Finder jobs after a restart and retries cleanup for marked failed uploads.

## Automatic cleanup

The Node.js server starts a periodic maintenance job through Next instrumentation.
Defaults are configurable with:

| Setting | Default | Purpose |
| --- | ---: | --- |
| `STORAGE_CLEANUP_ENABLED` | `true` | Enable the background janitor |
| `STORAGE_CLEANUP_INTERVAL_MINUTES` | `60` | Maintenance interval (minimum 5 minutes) |
| `STORAGE_TEMP_RETENTION_HOURS` | `24` | Keep known temporary/render staging files for this long |
| `STORAGE_ORPHAN_RETENTION_DAYS` | `30` | Keep confirmed unreferenced private media for this long |

The janitor only removes recognized temporary-file patterns, marked failed upload
directories, and media proven unreferenced by a complete, authenticated project
inventory. It skips active upload/render/export paths, unknown owners, symbolic
links, invalid inventories, and media referenced by another project. Inventory
sync failures deliberately stop destructive orphan cleanup. Local deletion and R2
deletion are idempotent/retryable; cloud lifecycle cleanup processes at most ten
queued objects per run after a one-hour grace period.
Active upload reservations are linked to their provisional object key, so even a
slow upload is excluded from cleanup; crashed reservations are released only after
the two-hour stale threshold and after no local task is using the path.

Final render files and project source files are preserved. Renderers use unique
staging outputs, remove intermediates on success/failure/cancel, and atomically
replace an existing final output only after a complete render succeeds.

## Visibility and manual maintenance

Authenticated administrators can inspect local disk usage at `GET
/api/admin/media-cleanup`. The response reports total bytes/files, categories
(Clip Finder projects, caption uploads/renders/derived media, clipping uploads/
renders, temporary files, metadata and other), active task count, and measurement
time. `POST /api/admin/media-cleanup` accepts `{ "dryRun": true }` by default;
use `{ "dryRun": false }` only when an administrator intends to execute the
reported cleanup. Logs use the `[Storage maintenance]` prefix and include cleanup
counts, failures, skipped active work and external queue status. No email alert is
sent by this endpoint.

Run the focused checks with `npm run test:storage`, `npm run test:private-media`,
and `npx tsx tests/media_lifecycle.test.ts`; run the TypeScript check with
`npm run typecheck`.

## Verification (2026-10-25)

- `npm run test:storage`: passed, including failed-stream cleanup, owner-scoped
  cancellation, reference-protected deletion, restart recovery, dry-run safety,
  and retention of active temporary files.
- `npm run test:private-media`: passed, including owner isolation, cache restore,
  integrity checks, upload failure cleanup, and storage/Class A/Class B quota caps.
- `npx tsx tests/media_lifecycle.test.ts`: passed, including queued R2 cleanup,
  active object protection, active upload reservation fencing, retries, shared
  reference protection, and project deletion.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Full `npm test`: 53 of 63 tests passed; 10 failed. Failures cover existing
  safe-area/default expectations, authenticated social-post API setup, custom
  brand preset and BGM expectations, Caption Maker local-storage restoration,
  and Clipping Studio crash-recovery snapshot expectations. These failures
  need a separate baseline investigation; they are not reported as fixed by the
  storage-lifecycle work.

## Deployment limits

The registry protects work within the running Node process. The metadata lock
reduces duplicate janitors when processes share the same storage directory, but
local storage and an in-process job registry are not a distributed storage/job
system. Use one worker instance with a persistent shared disk or move the job lock
and queue to a durable shared service before enabling multiple app instances.

Render Free has ephemeral local disk, so files stored only under `storage/` may be
lost on redeploy or instance restart. Durable media requires a configured private
R2 bucket, D1 migrations `0001`, `0002`, `0003`, `0005`, `0006`, `0007` and `0008`, and
`CLOUD_PRIVATE_MEDIA_ENABLED=true`;
the R2 cleanup queue additionally requires `CLOUD_MEDIA_LIFECYCLE_ENABLED=true`.

Migrations `0007` and `0008` are applied to the configured D1 database. The
current source has passed its focused storage tests, TypeScript check and
production build; the Render deployment and real restart/upload verification
are still pending.

The private-media integration applies conservative app-side R2 caps by default:

| Setting | Default | App behavior |
| --- | ---: | --- |
| `CLOUD_R2_STORAGE_LIMIT_BYTES` | `8000000000` (8 GB) | Reject new private-media backups before exceeding the cap |
| `CLOUD_R2_CLASS_A_LIMIT` | `800000` operations/month | Pause app-originated private-media writes at the cap |
| `CLOUD_R2_CLASS_B_LIMIT` | `8000000` operations/month | Pause app-originated private-media restores at the cap |

These caps are tracked in D1 by month key. They cover ReelSpark operations and
cataloged media only; other buckets, apps, direct Cloudflare usage, and
untracked objects can consume the same account allowance. They cannot guarantee
a zero bill or stop Cloudflare account-wide overage. No billing plan is changed.
Only media successfully backed up to private R2 survives a Render restart;
in-progress uploads and temporary render files remain local and can be lost.
