# Test Guide: AI Reel Studio & Clip Finder

This document describes the automated test matrix, verification procedures, and regression test suites for **ReelSpark** (`/` Clip Finder and `/caption-maker` AI Reel Studio).

---

## 1. Automated Test Execution

Google sign-in regression coverage: `npm run test:google-auth` (Google and D1 are mocked; no real accounts are created). See [GOOGLE_SIGN_IN.md](GOOGLE_SIGN_IN.md) for the configuration and live verification steps.

Run the complete 60-suite test runner:

```bash
# Direct node execution (reliable across Windows CMD and Linux)
cmd.exe /c node ./node_modules/tsx/dist/cli.mjs tests/test_suite.ts
```

Or via npm:
```bash
npm test
```

To run the Next.js production build and TypeScript compilation audit:
```bash
npm run build
```

---

## 2. Complete Automated Test Matrix (60 Suites)

| Test # | Test Name | File Under Test | Scope & Verification Objectives |
| :---: | :--- | :--- | :--- |
| **1** | YouTube URL Validation | `youtube/route.ts` | Validates standard `watch?v=`, `youtu.be/`, `embed/`, handles invalid URLs |
| **2** | SRT & ASS Timestamp Conversions | `srt.ts` | Millisecond accuracy for SRT (`HH:MM:SS,mmm`) and ASS (`H:MM:SS.cc`) |
| **3** | SRT Relative Timeline Offset Sync | `srt.ts` | Resets clip subtitles from source timeline (e.g. 12:30.000) to relative `00:00:00,000` |
| **4** | Subtitle Line Break Wrapping | `srt.ts` | Multi-line wrap formatting for vertical reel readability |
| **5** | Context Verification Guard | `context-verifier.ts` | Dangling pronouns ("Because of this..."), trailing conjunctions, and sentence boundaries |
| **6** | 60-Second Cap Enforcement | `ranking.ts` | Rejects candidate moments exceeding 60.00 seconds |
| **7** | Candidate Deduplication | `ranking.ts` | Eliminates overlapping candidates with >65% timeline collision |
| **8** | Filesystem Security | `storage.ts` | Path traversal prevention (`../../`), directory isolation, filename sanitization |
| **9** | Timeline Coverage Engine | `transcript.ts` | Merged time ranges and coverage percentage calculations |
| **10** | Semantic Search Engine | `transcript.ts` | Natural language queries and semantic keyword matching over spoken text |
| **11** | FFmpeg Media Pipeline | `ffmpeg.ts` | Synthetic media generation, cuts, crops vertical 9:16, burns subtitles, loudnorm audio |
| **12** | Bilingual Text & Title Options | `clip-to-reel.ts` | Fallback resolution for English and Hindi text |
| **13** | CapCut / VN Precision Trimmer | `clip-to-reel.ts` | Millisecond timestamp formatting, parsing, and boundary clamps |
| **14** | Transcript Word Ordering | `caption-grouping.ts` | Strict sequential order, non-overlapping bounds, duration integrity |
| **15** | Dynamic Pause Caption Grouping | `caption-grouping.ts` | Speech pause detection (>250ms), punctuation splits, manual merge/split |
| **16** | Keyword Emphasis Engine | `caption-grouping.ts` | Emotional keyword matching and 1-click manual override |
| **17** | Canvas Dimensions & Aspect Ratios | `types.ts` | 9:16 (1080x1920), 4:5 (1080x1350), 1:1 (1080x1080), 16:9 (1920x1080) |
| **18** | ASS Karaoke Subtitle Generation | `ass-generator.ts` | Generates ASS styles, `{\kXX}` karaoke tags, and highlight colors |
| **19** | Clip-to-Reel Bridge | `clip-to-reel.ts` | Bridges ClipCard candidates directly into CaptionProject instances |
| **20** | Clip Audio Isolation & Alignment | `clip-to-reel.ts` | Scopes audio processing strictly to selected clip start/end timestamps |
| **21** | 9-Position Coordinate Resolution | `canvas-position.ts` | Contain mode letterbox/pillarbox padding and anchor coordinates |
| **22** | Remotion / GSAP Typography Sync | `GsapAnimatedCaptions.tsx` | Timeline deterministic sync and canvas 9-position parity |
| **23** | Audio Media Probing | `audio-prober.ts` | VideoSourceType detection, channel count, duration, sample rate |
| **24** | Style Presets & Text Effects | `sample-data.ts` | Hormozi, Devotional, Beast, Minimalist, Cyberpunk, and Elegant presets |
| **25** | Text Zoom & Anti-Overlap Buffering| `caption-grouping.ts` | Zoom scaling buffers and layout safety checks |
| **26** | Google Fonts Catalog & Stylesheets | `sample-data.ts` | Multi-weight resolution and dynamic Google Fonts link generator |
| **27** | Normal Text Color & Opacity Parity | `ass-generator.ts` | Primary color, active highlight `#FCD905`, opacity blending |
| **28** | Custom Horizontal & Vertical Align | `ass-generator.ts` | Custom X (%) and Custom Y (%) offset coordinate resolution |
| **29** | Thumbnail Settings & Presets | `thumbnail-presets.ts` | Preset dimensions, font weights, badge configurations |
| **30** | Thumbnail Video Auto-Merge | `thumbnail-merger.ts` | Base64 persistence and Frame 0 poster injection |
| **31** | Thumbnail Image Fit & Position | `thumbnail-presets.ts` | Cover, contain, 9-alignments, and scaling parity |
| **32** | Zero Layout Shift Verification | `thumbnail-presets.ts` | Default positions, customY, overlay darkness parity |
| **33** | Instant Poster Merger Logic | `thumbnail-merger.ts` | Frame 0 pre-playback poster merger and disk validation |
| **34** | Badge Enable/Disable & Spacing | `thumbnail-presets.ts` | Element spacing, pill shape, border radiuses |
| **35** | Thumbnail Safe Area Overlay | `thumbnail-presets.ts` | Horizontal/Vertical anchor with safe area guide margins |
| **36** | Gemini Model Catalog & Persistence | `gemini-config.ts` | Flash 3.8, Flash 3.0, Flash 2.5 persistence |
| **37** | Dynamic Acoustic Speech Alignment | `caption-grouping.ts` | Pause-aware word grouping and timing boundary preservation |
| **38** | Video Audio Extraction Engine | `upload/route.ts` | Isolates audio streams into standalone voice assets |
| **39** | Audio Removal Cleanup | `page.tsx` | Resets transcript, caption groups, history on audio clear |
| **40** | Isolated Audio Processing | `AssetUploadSection.tsx` | Voice processing without mutating image assets; language sync |
| **41** | Hinglish Transliteration Engine | `clip-to-reel.ts` | 3-way language switching (EN, HI, Hinglish) |
| **42** | Auto Animated Viral Emojis | `sample-data.ts` | Dynamic emoji keyword matching and enrichments |
| **43** | BGM Presets & Mixer Volume | `sample-data.ts` | Multi-track library and volume level settings |
| **44** | Hardware Video Encoder Detection | `ffmpeg.ts` | Auto-detects NVENC / QuickSync / AMF with CPU fallback |
| **45** | Dual Audio Mixer & Voice Boost | `ffmpeg-renderer.ts` | 200% voice boost, fade in/out, ducking, denoise |
| **46** | Gemini AI Audio Engine | `gemini-audio.ts` | Auto-SFX cues, BGM match, filler jump-cutter, diarization |
| **47** | AI Reel Social Post Copywriter | `generate-social/route.ts`| Selected-clip only hooks, captions, CTAs, hashtags across 6 tones |
| **48** | Custom Brand Style Presets | `custom-presets.ts` | "Save As My Style", LocalStorage persistence, deletion |
| **49** | Multi-Format Subtitle Exporter | `srt-generator.ts` | .SRT, .VTT, and .TXT phrase and word level exports |
| **50** | Interactive Waveform Drag Handles | `CaptionTimeline.tsx` | Trim drag handles, word bounds snap, boundary clamps |
| **51** | Custom Background Music Library | `custom-bgm.ts` | Upload MP3/WAV, storage, persistent library, mixer controls |
| **52** | Text Transforms & 9-Position Safe Areas | `text-transform.ts` | UPPERCASE, lowercase, sentence case; 9-position guides |
| **53** | Word-Level Timing Studio | `timing-adjuster.ts` | Nudge (-100ms..+100ms), snap to previous, distribute, gap alerts |
| **54** | Advanced Multi-Resolution Export | `export-settings.ts` | 720p/1080p/2K/4K, 24/25/30/60 FPS, CRF quality, bitrate controls |
| **55** | AI Smart Editing — Silence Studio | `smart-editor.ts` | Pause detection, filler jump-cuts, viral hook analyzer |
| **56** | Project Autosave & Crash Recovery | `project-storage.ts` | Debounced autosave, version snapshots, duplicate, `.reelproj` |
| **57** | Dedicated AI Social Post Studio Page | `social-post/page.tsx` | Clip context preservation, navigation bridge, and multi-tone generation |
| **58** | Large Media & Audio Upload Support | `media-validation.ts` | 500MB upload allowance, `.m4a` audio validation, and Next.js `proxyClientMaxBodySize` configuration |
| **59** | Clipping Studio Phase 1 Foundation | `contracts.ts`, `supabase.ts` | Media service contracts, timestamp parser, SQL migration, Supabase fallback |
| **60** | Clipping Studio Phase 2 Timeline & Bulk | `contracts.ts`, `MediaLibrary.tsx` | Media range URLs, frame calculations, bulk timestamp line parser, non-destructive editing |
| **61** | Clipping Studio Phase 3 Merge Studio | `merge-planner.ts`, `MergeStudio.tsx` | Independent multi-recipe builder, lossless stream-copy vs filter-complex concat planning, reordering |
| **62** | Clipping Studio Phase 4 Export Queue | `export-engine.ts`, `ExportStudio.tsx` | Local FFmpeg export daemon on 127.0.0.1, stream copy, audio extraction, progress tracking, provenance |
| **63** | Clipping Studio Phase 5 Persistence & Recovery | `local-persistence.ts`, `StudioNavbar.tsx` | Local persistence, project duplication, 30-step undo/redo, autosave crash snapshots, Supabase sync |
| **64** | Social Media Reel Safe-Zone Measurement System | `safe-zone.ts`, `SafeAreaOverlay.tsx` | 8-section test suite verifying $1080 \times 1920$ canvas divisibility, 4 platform presets (Instagram, Facebook, Shorts, Threads), 4:5 and 1:1 mathematical derivation, responsive scaling invariance across $360\text{--}1080\text{px}$, custom overrides, and zero export bleeding |
| **65** | Caption & Thumbnail Safe-Zone Two-Way Sync | `safe-zone.ts`, `ThumbnailPreview.tsx`, `page.tsx` | Two-way platform and override synchronization between video reel caption studio and thumbnail cover creator, 1:1 profile grid ($1080 \times 1080\,\text{px}$) and 4:5 in-feed ($1080 \times 1350\,\text{px}$) bounds, and format dimension checks |
| **66** | Comprehensive Presets Analysis & Property Isolation | `sample-data.ts`, `thumbnail-presets.ts` | 7-section analysis verifying all 11 reel style presets, property bleed prevention, 6 thumbnail presets, 6 studio gradients, physical BGM audio file existence, and Indic/Devanagari grapheme cluster segmentation |
| **67** | Safe Area Dimension & Codec Verification | `safe-zone.ts`, `ass-generator.ts` | Even-number codec checks, platform presets registry, safe area boundaries, ASS subtitle wrapping, and pre-flight validation |

---

## 3. Production Verification Checkpoints

Server media preparation regression check:

```bash
npx tsx tests/server_media_client.test.ts
npx tsx tests/export_fallback_routes.test.ts
npx tsx tests/project_access.test.ts
npx tsx tests/media_access.test.ts
npx tsx tests/clipping_media_security.test.ts
npx tsx tests/server_export_plan.test.ts
npx tsx tests/settings_account_cache.test.ts
npx tsx tests/cloud_project_documents.test.ts
npx tsx tests/private_media_cloud.test.ts
npx tsx tests/media_lifecycle.test.ts
# Optional real local FFmpeg/FFprobe verification:
npx tsx tests/server_export_plan.test.ts --real
```

Passed locally on Windows: same-origin default, explicitly configured standalone
fallback, failed HTTP response handling, invalid health payload rejection and
request timeout. `npm run typecheck` and `node --check scripts/patch-remotion.js`
also passed. These checks do not verify Linux Chromium or actual video rendering.

Export fallback route checks passed locally with mocked daemon/process handles:
offline status/list, daemon recovery merge, successful cancellation, terminal-job
conflict, unsupported retry and missing job. This does not verify a real FFmpeg
process cancellation or durable job recovery after restart.

Project access checks cover the owner/other-user/ownerless policy and anonymous
list/create/read/update/delete rejection. Actual two-account browser testing and
all remaining API families are still pending.

Media access regression checks passed locally using temporary fixtures: user
ownership, write-once owner records, project and per-user render file isolation,
anonymous upload/download rejection, cross-origin upload rejection, and media
range responses (partial, suffix, invalid and out-of-bounds). TypeScript passed.
Real two-account browser sessions, legacy ownership migration, Linux rendering
and the remaining Clipping Studio/transcription/trim APIs are not verified here.

Clipping/transcription security checks subsequently passed locally with temporary
fixtures and the explicit development demo identity: anonymous API rejection,
project owner/other-user/legacy/traversal rules, other-user media rejection for
probe/transcribe/trim/bridge/relink, protected deletion, owned no-op trimming,
cross-origin rejection and the public raw-FFmpeg export gate. Export fallback tests
now also confirm another owner's jobs and unregistered daemon jobs are hidden.
Actual Google sessions, real transcription/FFmpeg execution, production command
planning and durable owner/job storage remain untested or unfinished.

Server export planning tests now cover strict structured options, ownership,
unique server-owned output directories, duration checks, rejection of raw args,
custom paths/invalid formats/remote sources, single-clip and video/audio merge
plans. Real local Windows FFmpeg single-clip and two-segment video merge exports
passed with nonempty audio/video output and duration checks. Normalized MP3
merge also passed with audio-only and duration verification. Linux Docker and
browser end-to-end flows remain untested. Crossfade and separate audio/video
files are explicitly unsupported. Production no longer uses the blanket 503
gate: raw command submissions are rejected with 400 instead.

After the structured export integration, `npm run typecheck`, the server planner
lint check and `npm run build` passed locally. A dynamic runtime-output tracing
warning in the first build was corrected; the repeated build passed without
that warning. Existing clipping security and export fallback suites also passed.

Settings/account-cache checks passed with mocked D1 sessions and browser storage:
Alice/Bob draft and clipping-project separation, guest isolation, preservation of
legacy keys, anonymous settings/system/health/support rejection, ordinary-member
settings/test/system rejection, admin input validation and cross-origin denial.
No real settings or support records were written by this suite. Real multi-tab,
BFCache, OAuth redirect and account-switch editor testing remain pending.

After account-cache integration, production build and TypeScript passed. Targeted
lint checks for the cache/admin/auth/boundary modules passed. Media-access,
Clipping Studio security and Google-auth regression suites passed again locally.

D1 project-document checks passed using in-memory SQLite with the actual additive
migration and mocked HTTP transport: owner-scoped lists, atomic conflict denial,
owner-scoped deletion, metadata API saves, disabled mode, anonymous rejection and
503 on cloud failure. TypeScript and targeted metadata API/repository/client lint
checks passed. No live database, R2 object or local user project was modified.
Production build, settings/account-cache tests and Clipping Studio security
regressions passed again after this metadata integration.

Private media checks passed using SQLite + a fake object store: full local-cache
loss and ownership restoration, other-user denial, checksum failure, temporary
file cleanup, traversal rejection, disabled mode and failed-catalog rollback.
Media-access and clipping-security regressions, TypeScript, targeted private
storage lint and production build passed. No live R2 request was made.
`npm audit` reports 11 alerts (9 high, 2 moderate) in Remotion/Wrangler chains;
the AWS SDK was added without running unrelated force fixes.

Subsequent lifecycle/security work: SQLite and fake-object tests passed for
superseded uploads, dry-run, active-object protection, retry after storage
failure, owner/shared-reference checks, tombstones and durable project deletion.
Targeted lifecycle lint and TypeScript passed. Scoped Zod/Undici overrides give
`npm audit`: 0 vulnerabilities. Real local FFmpeg single/video-merge/normalized
MP3 tests and Remotion composition bundling passed after these overrides.
Wrangler still reports 4.152.0. Node remains 24.21.0 with bundled Undici 7.29.1;
that runtime security issue is not fixed by npm overrides. No live cloud
deletion or existing local user-media deletion was performed.
The production build, settings/admin-cleanup authorization, private-media,
cloud-document and Google-auth suites also passed after lifecycle integration.
Full and production-only npm audits both report 0 vulnerabilities; the Node
runtime gate described in DEPENDENCY_SECURITY.md was still open at that stage.

## Approved nvm Node 24.22.1 upgrade

Verified runtime: Node v24.22.1, npm 11.19.1, built-in Undici 7.30.1. All commands
below ran after `. .\scripts\use-project-node.ps1` to avoid the standalone PATH
conflict. nvm default is 24.22.1; old installations were not removed.

- `npm ci`: passed (616 packages; 0 audit vulnerabilities). Remotion postinstall
  patches reapplied. Warnings remain for ESLint support, the patch script's
  unspecified module type and npm allowScripts coverage; no broad approval or
  unrelated dependency change was made to suppress them.
- `npm run build`: passed, including TypeScript and all route compilation.
- Twelve regression/export suites passed: Google auth, social platform rules,
  media client, project/media access, clipping security, export fallback,
  account/settings, cloud documents, private media, lifecycle, server export plan.
- Real local FFmpeg single-clip, video merge and normalized MP3 exports passed.
- Remotion composition bundling passed after the clean install.
- Runtime guard tests reject 24.21.0, 24.22.0 and 25.x; accept 24.22.1 and later 24.x.
- Local production smoke: `/` 200, `/api/auth/providers` 200, `/api/projects` 401
  without login. The temporary test server was stopped afterward.
- npm audit: 0 vulnerabilities. Package/lock engines match `>=24.22.1 <25`.

Linux Docker image, real Google OAuth, live cloud media and full browser QA were
not tested here. The unmodified standalone Windows Node still wins in a terminal
without the helper; project pre-dev/build/start checks intentionally reject it.

## Portable storage and Linux verification preparation

Storage-reference tests passed: changed root, default Windows-path rebinding,
portable save/load and traversal rejection. Cloud document and lifecycle tests
passed with portable payloads. `npm run verify:server -- --real` passed all 13
suites, including real local FFmpeg exports. TypeScript and production build
passed. The manual workflow YAML was parsed and its manual trigger/read-only
permissions checked. Linux execution remains NOT TESTED (no local container/WSL
runtime); no workflow was pushed or dispatched. No live D1 writes/R2 uploads ran.
Read-only D1 schema verification confirmed that migrations 0001–0003 have not
been applied. Missing Google/R2 credentials and AUTH_URL remain deployment gates.

Before releasing or deploying changes:
1. **Automated Unit & Integration Tests**:
   Ensure all core tests pass with 0 failures:
   ```bash
   npm test
   ```
2. **Specialized Safe-Zone & Preset Test Suites**:
   ```bash
   # Social Media Reel Safe-Zone Measurement System
   npm run test:safe-zone

   # Caption & Thumbnail Safe-Zone Two-Way Sync
   npm run test:safe-sync

   # Presets Comprehensive Analysis & Isolation
   npm run test:presets
   ```
3. **Next.js Compilation & Type-Checking**:
   Ensure all static and dynamic routes compile cleanly with zero TypeScript errors:
   ```bash
   npm run typecheck
   npm run build
   ```
