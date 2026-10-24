# Empty workspace and account isolation review

Reviewed 2026-10-24. A new account starts without user-created content. Normal
editor controls, fonts, platform rules and selectable preset libraries remain.
Existing user work is not deleted on login.

| Area | Result / evidence |
| --- | --- |
| Fixed hashtags and social heading | Empty defaults in server and UI; user-added tags round-trip; deleting all tags does not re-seed them. Social intelligence suite passes. |
| Social accounts and profile | Account queries use authenticated user ID; no seeded accounts; empty bio/custom profile fields. Profile writes pin the authenticated user ID. Real name/email still come from the signed-in identity. |
| Reel Maker | Initial state and no-cache fallback use the empty project, with no audio/image/transcript/groups. Existing account-scoped drafts still restore. |
| Thumbnail | No generated promotional title/subtitle/badge by default. An actual user project title can populate its cover. Presets remain explicit user choices. |
| Social post generator | Empty title, transcript and duration before user supplies content or their own clip context. No default generated post. |
| Clipping Studio | Existing initialization loads account-scoped local projects and owner-scoped remote snapshots; otherwise projects=[] and activeProject=null. No seed project is created. |
| Clip Finder/dashboard/export access | Owner-scoped server project list and protected media/export endpoints; owner/other-user/anonymous regression suites verify isolation. |
| Browser drafts, history, BGM, custom presets, AI key, social context | Account-prefixed cache. Regression checks verify Alice's data is hidden from Bob and remains available when Alice returns. Legacy unscoped cache is not imported. |
| Account changes | Existing workspace boundary reloads on identity changes and BFCache restore; cross-tab notifications trigger session refresh. Automated cache tests pass; exhaustive real multi-browser switching has not been performed. |
| Demo login message | Removed hardcoded admin/admin landing-page callout. Production demo login remains disabled. |
| Brand logo | Restored original ReelSpark SVG wordmark at the user's request. Reel Maker remains the editor feature name. |
| Safe Mode | Caption/thumbnail defaults and restore fallbacks are OFF; guides start OFF when reopening cached projects. Users can still toggle guides ON during editing. |
| Legacy demo draft | Restore removes only the bundled sample's exact default audio/title/word timestamps, unchanged raw transcripts and known sample cover copy. Uploaded media, renamed/edited reels and custom cover text are preserved. |

## Persistence boundaries still requiring deployment work

Browser cache is per account and per browser, not cross-device durable storage.
Render D1 credential transfer is pending explicit approval; the prepared D1
fields have not been saved. R2, metadata/lifecycle activation, cloud migrations,
complete Reel Maker/Clip Finder cloud recovery and restart-safe exports remain
unfinished. Do not describe the whole application as durable or production-ready.
No existing account, project, tag list or cloud object was purged by this cleanup.

## Transcription correction

The reported "Untitled Reel" transcript was traced to the acoustic heuristic
fallback generating fictional clauses from a project title. The production
transcription router no longer uses that fallback. Speech recognition errors
propagate; missing Gemini configuration returns HTTP 503. Audio requests cannot
fall back to a text-only Ollama prompt. Only Gemini-provenance caches are accepted,
and Re-analyze explicitly bypasses cache. Failed manual analysis removes the
verified flag while preserving the user's draft. Existing inaccurate text is not
silently deleted from uploaded projects. Real audio recognition on Render still
requires a configured, working Gemini API key; OAuth credentials do not supply it.
