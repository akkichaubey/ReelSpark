# Saved Reels implementation plan

Existing: Studio clip audition, non-destructive millisecond trims, title/notes, duplicates, clip-to-caption bridge, Reel Maker full JSON state and render pipeline, account-scoped caches, D1 project_documents, private R2 backup/restore, ownership checks and conservative cleanup.

Gaps: no independent library entity; bridge filenames can be overwritten on retrim; browser snapshots are not durable library records; no clip timing review dialog or explicit revision-safe reel saves.

Implementation: add an owner-scoped saved-reel document in the existing project_documents table (no schema replacement). Use local atomic JSON when cloud media is disabled; use D1 + verified R2 media when cloud media is configured. Retain managed assets in immutable content-addressed caption asset directories outside project trees. Reuse files across saved reels by hash, and include server documents in the existing cleanup reference inventory. Metadata deletion never cascades to shared files; normal age-based cleanup handles unreferenced local assets conservatively.

Reuse the existing clip bridge for standalone clip media and Reel Maker for all caption/style edits. Add a bounds-review dialog, library with playback/search/filter/views/actions, and revision-checked explicit Save Changes / Save as New / Cancel. Keep normal project workflows and autosave unchanged outside saved-reel edit sessions. Preserve all JSON settings; do not regenerate manual words when reopening.

QA: actual synthetic video/audio, clip extraction and re-edit timing; independent save/project deletion/restart/duplicates; invalid bounds, auth, cross-user access, revision conflicts and failing storage; cleanup retention; typecheck/build and existing storage/Studio/caption regressions; browser desktop/tablet/mobile checks. External AI calls are not required to validate the library.
