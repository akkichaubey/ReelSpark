# Server deployment readiness

## Target

Render Docker Free is a preview target, not a production-readiness guarantee.
No service has been created or deployed by these configuration changes.
GitHub auto-deploy will be configured after the security and persistence gates pass.

## Preparation completed

- Blueprint explicitly selects Free and does not request a paid persistent disk.
- Removed obsolete Supabase environment prompts; added D1 and Google auth prompts.
- Demo login is disabled in the Blueprint.
- Docker includes FFmpeg, Chromium and Noto Core fonts for Hindi text.
- Next.js listens on all container interfaces. The application remote-host guard
  remains enabled intentionally; do not enable public access before API authorization review.

## Outstanding gates before public deployment

1. Verify credential rotation; sanitized templates do not revoke old credentials.
2. Audit and enforce authentication and ownership on upload, render and project APIs.
   First slice completed: `/api/projects` list/create and every `/api/projects/[id]`
   handler now require authentication and project ownership (including analyze,
   upload, YouTube import, search, render, clip audio and ZIP export). Owner comes
   from the session, not the request body. Ownerless legacy projects are hidden
   pending an explicit migration; their files have not been deleted. File-serving,
   caption-maker and clipping-studio endpoints still need their own authorization
   audit before public access. This is NOT full application isolation yet.
   Next slice: private file downloads now require login and verified ownership;
   project manifests and new caption upload owner records supply ownership.
   New caption uploads require login and same-origin requests, use UUID asset IDs
   and write-once owner metadata. Render routes require login, validate owned
   source media, and use per-user output namespaces. Shipped samples/BGM remain
   permitted. Invalid media byte ranges return 416; private files are not cached.
   Legacy caption uploads, old renders and Clipping Studio shared files are denied
   until ownership migration is implemented; no existing files were removed.
   Clipping Studio media import/relink/probe/bridge/delete and caption
   transcription/trim now require login, same-origin mutations and owned media.
   Fresh clipping project directories receive write-once owner records; legacy
   directories cannot be claimed. Raw desktop/server paths are no longer accepted
   for import/relink unless the file already belongs to the account; upload instead.
   Bridge and trimmed output paths now have user namespaces and can be downloaded
   by their owner. Shared public samples must be uploaded before transcription/trim.
   Export list/read/cancel/retry routes enforce recorded job ownership; unknown
   legacy daemon jobs are hidden. Job ownership remains process-local.
   Export submission now accepts strict structured source/trim/output options,
   not raw FFmpeg arguments or custom output paths. Server checks ownership,
   probes actual duration/streams, validates boundaries and creates a unique
   output directory beneath the owned project. The earlier blanket 503 gate is
   replaced by this validated contract. Single clips and ordered video/audio
   merges execute in-process without depending on a visitor's media daemon.
   Merges currently re-encode for precise segments rather than stream-copy;
   crossfade and separate-video/audio output are explicitly unsupported, not
   silently approximated. Custom PC output directories are not used by the server.
   The UI sends structured requests, records API failures and adopts server paths.
   Real local Windows single and merge FFmpeg verification has passed; Linux
   container execution and full browser export flows remain unverified. No public
   deployment is ready yet. Shared server settings/test endpoints and detailed
   system diagnostics now require an admin role, and mutations validate origin.
   Media health and support submission require login. Global settings are NOT
   per-user BYOK settings; ordinary members cannot change a shared server key.
   No account has been promoted automatically; admin provisioning is outstanding.
   Private browser drafts, snapshots, clipping projects/recovery data, custom
   BGM/presets, social context and cached Gemini input now use account namespaces.
   Legacy unscoped keys remain untouched and are not auto-imported. A root
   workspace boundary waits for session identification before cache restoration;
   login/logout/account changes reload to discard old editor memory and timers.
   Other tabs recheck on identity notification/focus; BFCache restoration reloads.
   These are UI cache protections, not encryption of browser localStorage.
   Quotas, rate limits, durable support/settings storage, per-user AI credentials,
   legacy migration and real cross-tab/browser verification remain outstanding.
3. Replace ephemeral media persistence with authenticated durable cloud storage.
   Metadata groundwork: Clipping Studio now uses an authenticated server D1
   snapshot API with atomic owner-scoped writes and full project payloads.
   Browser code no longer imports the D1 client. An additive migration and
   `CLOUD_PERSISTENCE.md` describe activation. Feature is disabled by default;
   no remote migration or live sync was performed. Missing cloud connectivity
   produces errors rather than a false successful sync. Local cache remains.
   This does NOT persist media, restore owner files, recover running exports,
   cover other editors, or complete durable deletion.
   Private media preparation now adds an opt-in S3 adapter, owner-scoped D1
   catalog, upload/output backup hooks and checked local-cache restoration.
   Mock object-store + real SQLite tests verify entire-cache loss/recovery,
   two-user isolation, hash/size checks, partial cleanup and rollback. No live
   bucket/API/migration was used. Flags remain false. Main Clip Finder files,
   complete editor/job recovery, durable deletion/GC, quotas and real Linux/cloud
   testing remain outstanding. Lifecycle migration 0003 now adds opt-in durable
   object inventory, project tombstones and explicit bounded admin cleanup.
   No live deletions/migrations occurred. UI deletion waits for confirmation.
   Scoped nested security overrides reduce npm audit from 11 alerts to 0; Node
   24.21.0 bundled affected Undici 7.29.1; the approved nvm upgrade now provides
   Node 24.22.1 / Undici 7.30.1 with verified build/tests and local production
   smoke results. Version files/engines and Docker base are pinned. The old
   standalone Windows PATH entry remains; use scripts/use-project-node.ps1 in
   each project terminal. See NODE_RUNTIME.md and DEPENDENCY_SECURITY.md.
4. Linux Remotion now uses packaged native binaries, and both CJS/ESM patch
   templates only auto-select project `bin/` on Windows. Chromium is explicitly
   passed to composition selection and rendering. GitHub-hosted Linux execution
   passed for the production Docker build and a short Hindi-captioned audio/video render.
5. Browser media health/probe now default to same-origin APIs with timeouts;
   explicit standalone configuration remains supported. Export routes now share
   a process-wide fallback job registry and process handles; local status/cancel
   work without the daemon, and daemon recovery does not hide fallback jobs.
   The UI respects rejected cancel/retry responses. Offline retry remains
   explicitly unsupported (501). Restart recovery and replica support remain outstanding.
6. Choose a server-reachable AI provider. Local Ollama is not deployed by this Dockerfile.
7. Build the Linux image and render a short Hindi-captioned video with audio;
   measure memory and concurrency before declaring Free adequate.
   GitHub Actions Docker/regression/Hindi-render verification passed on commit
   d350832 (run 40069044763). No local Docker/Podman/WSL runtime is installed. Portable clipping
   snapshot paths and cloud-deleted cache reconciliation are now implemented.
8. Set the real HTTPS AUTH_URL and Google callback once a service URL is assigned.
   Latest read-only check: D1 is reachable but new migration tables are missing;
   Google OAuth/R2 credentials and AUTH_URL are absent. See DEPLOYMENT_HANDOFF.md.

## Verification

- Earlier focused Google auth and social platform suites passed locally on Windows.
- Linux Docker build, all 13 regression suites, Chromium launch and short Hindi
  rendering passed: https://github.com/akkichaubey/ReelSpark/actions/runs/40069044763.
  Cloud persistence and real Google OAuth remain untested. Render Free resource
  capacity and Hindi visual quality remain unverified. No end-to-end server-readiness claim is made.
- Free services sleep after inactivity and lose local runtime files on restart,
  redeploy or sleep. See https://render.com/docs/free.
