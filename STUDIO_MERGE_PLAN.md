# Unified video and audio workspace

## Review and dependency map (before implementation)

- `src/app/page.tsx`: dashboard and complete Clip Finder workflow: project creation, uploads/YouTube fallback, analysis polling, language/topic/sort filters, semantic search, candidate editing/selection, subtitles, individual/batch rendering, ZIP/SRT export, Reel Maker and social-post handoffs.
- `StudioShell` / `use-clipping-store`: media library/probe/relink, frame/timestamp editing, bulk clips, audition/playback, merge recipes, export queue/retry/cancel, undo/redo and recovery, local account cache and optional D1 sync.
- AI manifests (`Project`, seconds) and timeline documents (`ClippingProject`, milliseconds) have independent identities and persistence. They must not be destructively migrated or treated as interchangeable.
- `/api/projects` owns AI manifests; `/api/clipping-studio` owns manual editing/export. Media ownership, same-origin checks, private storage restoration, D1 documents and storage-reference inventory remain the authorization/durability boundaries.
- Caption Maker/Reel Maker, social publishing, AI provider settings and both export engines depend on existing contracts. Preserve those entry points and settings.
- Existing uncommitted caption, model and UI work is present. Do not reset or replace it.

## Implementation

1. Extract existing dashboard/AI component intact so it can render embedded, with explicit project identity and change callbacks. Keep the root page and old Clip Finder URLs working.
2. Use StudioShell as the single editing workspace, add AI Moments and a combined project picker, and route dashboard projects into it.
3. Add an additive, idempotent project adapter. Link source IDs, retain AI manifests, reuse original media, convert timestamps explicitly, append only newly selected candidates, and preserve all existing timeline edits/recipes/jobs. No automatic analysis or destructive migration.
4. Add authenticated server bridge operations for existing AI projects and Studio assets. Check ownership, origin, identifiers, media and metadata before linking. Retain existing endpoints.
5. Load heavy AI/editor panels on demand, preserve AI state while switching tabs, and show actionable loading/error/empty states.

## Validation

Baseline: `npm run typecheck` passes before changes.
Add adapter tests for repeated imports, edited clips, selection, milliseconds, invalid/out-of-range boundaries, media-free projects, schema compatibility and unchanged source objects. Add route security checks. Run existing clipping phases, relevant authorization/storage/export suites, full test suite, TypeScript and production build. Record actual results and limitations; zero regression is a target, not an untested guarantee.

## Data compatibility

No deletion or bulk rewrite of existing records. Optional link fields are additive. Original manifests retain transcript, bilingual metadata, scoring, verification and settings. Timeline clips keep their own editable boundaries. Imports never silently overwrite edits. Shared media remain protected through existing ownership and reference tracking. Cloud sync failure must retain the local project and report the failure.

## Completed review and validation

- Unified the navigation and reused the original AI interface rather than reimplementing its actions. Existing analysis routes, uploads, settings, bilingual candidates, semantic search, rendering, subtitles, Reel Maker and social handoffs remain available.
- Added links in both directions, stable project/tab URLs, a combined project picker, explicit selected-candidate imports, Save / Sync, deferred editor loading, and preserved import provenance.
- Reopening with no browser cache uses the saved linked workspace instead of overwriting edits with a new empty record. Unreadable saved data fails closed. Shared source paths are portable in cloud metadata and protected from deletion in either workflow.
- Fixed overlapping initialization requests resetting the requested tab. Added regression checks for out-of-order responses, import undo/redo, account-scoped caches, invalid ranges, offline media, corruption, preserved source data and access control.
- Consolidated duplicate filename-template implementations through a backward-compatible re-export. Fixed duplicated recipe items retaining old clip/recipe references; AI import provenance survives duplication.
- Updated old test fixtures for existing account scoping, authenticated route calls, cloud-disabled responses, opt-in guides/badges and the existing caption animation timing. Product defaults were not changed to satisfy these tests.

Validation results:

- Production build and TypeScript check: passed.
- Full legacy suite: **63 / 63 passed**.
- All five clipping phase suites: **40 / 40 passed** (11 + 9 + 7 + 7 + 6).
- Project authorization, clipping media security, server export planning, fallback export routes, cloud documents, private media, storage maintenance, runtime environment and unified Studio suites: passed.
- Targeted ESLint on changed workspace, bridge, persistence, storage and route files: passed.
- Browser: uploaded a four-second synthetic video, opened it from the dashboard in the Studio, imported a synthetic AI clip, renamed the timeline clip and reimported it. The name was retained and clip count stayed at one. Refresh retained the project, timeline tab and edit. A real linked-source export reached Done and generated a two-second MP4. Original media played in the existing timeline UI. Mobile check at 390px reported viewport/document/main widths of 390px, without page-level horizontal overflow. All 15 regression suite processes exited successfully.

Test logs: `C:/Users/dsg14/AppData/Local/Temp/reelspark-final-regressions-8kbF3k`.
Browser fixture: `Unified Studio UI Verification` (`proj_1793038498354_dsxtf`), explicitly synthetic and retained for inspection. No paid AI inference was used for this fixture.

Limits: changes are local and have not been deployed. Production provider availability, billing quotas, live OAuth publishing, and long-running production renders were not exercised by these isolated regression checks. Existing ownerless/legacy records are retained and remain subject to the original ownership rules; the merge does not silently claim them for an account. The passing checks support compatibility, but do not constitute a guarantee covering every production workload.
