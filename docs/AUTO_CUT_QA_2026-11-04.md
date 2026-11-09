# Auto Cut verification — 4 November 2026

## Latest follow-up: lint and real AI integration

The two remaining items called out in the previous chat response have now been addressed:

- Repository-wide ESLint exits successfully with **0 errors and 182 warnings**. The 29 errors were fixed without disabling lint rules. Changes cover prop-derived state, cancelled storage hydration, default export selection, callback declaration order, background image race handling, client navigation and event IDs. Playback no longer mutates parent clip candidates. Smart Editor selects detected gaps on initialization and resets selection when detection inputs change.
- Auto Cut now offers **AI visual and speech analysis** using the existing configured provider, alongside an explicit local scene/audio option. Gemini receives actual sampled JPEG frames and corresponding audio windows. Ollama receives actual image inputs and Cloudflare-recognized speech when configured. No transcript or action label is fabricated as a fallback.
- Model results are schema-validated. Unknown/duplicate clip IDs, out-of-window speech, incomplete batches and provider failures are rejected. Gemini uses a structured response schema; an initial live speech test revealed missing transcript field constraints, which were corrected and successfully retested.
- Results feed the duration optimizer and full Reel Maker timeline, including recognized source-timed captions. Cooking-mode selection prioritizes evidenced activity categories while preserving source order. AI confidence remains explicitly an estimate.
- Silent audio tracks no longer cause cooking or semantic visual modes to discard the entire video. Regression fixtures cover both missing audio and present-but-silent audio. Recognized source-word timings are also tested through the Reel Maker bridge into the assembled caption timeline.
- Semantic results are cached inside the owned project, keyed by file identity, settings and provider/model. Ownership is checked before cache access or inference; invalid caches are ignored. Cache growth is bounded to 20 entries per project without deleting media or saved versions. Cancellation propagates to provider calls and FFmpeg.

Latest validation:

| Check | Actual result |
| --- | --- |
| Final repository ESLint | PASS: 0 errors, 182 warnings |
| TypeScript / production build | PASS; final build has no prior dynamic-file tracing warning |
| Auto Cut tests with `--render` | PASS, including real Remotion multi-clip export, provider transport/schema validation, failure rejection, ownership and cache reuse |
| Live Gemini vision request | PASS on a generated red-screen video: correctly described static red footage, with no cooking action or speech |
| Live Gemini speech request | PASS on generated English speech: recognized the supplied instructions and returned bounded source-timed words |
| Existing browser regression run | 13 passed: Auto Cut, authentication/routes, shared controls, accessibility, timeline dialogs and thumbnail cover |
| Additional editor-state browser tests | Both passed: selected-gap initialization/reset and delayed-image/aspect-change behavior; the gap test was rerun after correcting its expectation for the existing gap-merging behavior |
| Studio / timeline / caption-sync / thumbnail-cover / social / publishing-security suites | PASS |

The live AI tests used generated QA media, not private user videos. Ollama image transport and Cloudflare speech parsing were tested with controlled HTTP responses; live model verification used the configured Gemini 2.5 Flash provider. The general browser tests use isolated real components with controlled network responses where documented. No live social posts or messages were sent.

Limits still requiring production qualification: AI uses two frames per selected analysis window, with at most 96 windows spread across longer sources. It cannot guarantee recognition of every action or perfect speech timing. Real cooking/podcast/tutorial corpus quality, Hindi/Hinglish recognition and a complete signed-in browser upload-to-export journey have not been certified. Processing remains request-bound; this change does not add a durable background analysis worker. The existing cut-only assembly and first-audio-track restrictions remain.

New AI implementation: `src/lib/auto-cut/semantic.ts`; existing Gemini/Ollama clients extended with cancellable multimodal inputs and structured responses; Cloudflare adapter added for timestamped speech. The Auto Cut API, controls, optimizer, reel bridge and regression tests were updated. The remaining changed components correspond to the repository lint failures listed in the original audit.

Provider references consulted: [Ollama vision input format](https://github.com/ollama/ollama/blob/main/docs/capabilities/vision.mdx), [Gemini generateContent API](https://ai.google.dev/api/generate-content), [Cloudflare Whisper input/output contract](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/).

The sections below record earlier audit stages and are historical; this section supersedes their lint and semantic-AI status.

## Remediation and retest

The defects below were subsequently addressed in the Auto Cut implementation:

- The API checks project ownership, media ownership (including resolved filesystem paths), project identifiers and settings before processing. Unsupported automatic transitions return a validation error. The Node runtime is explicit.
- Selection never restores rejected clips or extends source ranges to manufacture duration. Shortfall is reported honestly. Fast pacing changes cut lengths while preserving original playback speed, which the existing timeline supports.
- Fabricated visual-action, cooking-phase, speech and confidence claims were removed. Analysis now uses measured scene changes and silence detection. Cooking mode preserves chronology without claiming action recognition. Silence presets have distinct thresholds; scene priority, pacing and intensity affect selection.
- Every candidate is reviewable. Selection totals derive from state, and selected clips can be regenerated without rerunning FFmpeg. Requests are cancellable; changing media or leaving the editor aborts the request and prevents stale results from appearing. FFmpeg scene/audio/thumbnail processes have timeouts and receive cancellation signals.
- Reel Maker receives the complete sequence through the existing Saved Reels workflow. Linked video, original audio and caption clips share source offsets. Saved versions remain independent. Studio's clip-library action remains available.
- The build's whole-project tracing warning was resolved.

Verification after fixes:

| Executed check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, no prior tracing warning |
| `npm run test:autocut -- --render` | PASS: modes/durations, rejection, bounds, original media, real tone/no-audio/silence fixtures, real route validation/auth/origin/cross-account checks, saved sequence restoration, caption mapping, and real Remotion export with audio |
| `npx playwright test tests/browser/auto-cut.spec.ts` | PASS: 2 component browser tests covering candidate review, selection totals, regeneration, full sequence handoff, clip-library insertion, desktop/mobile overflow, errors, cancellation and source changes |
| Studio, timeline, caption-sync and Saved Reels suites | PASS |
| Auto Cut plus live read-only Playwright suites | PASS: 5 browser tests including existing live authentication gates and routes |
| ESLint restricted to Auto Cut files | PASS with zero errors; one existing-style image optimization warning |
| Repository-wide ESLint rerun | FAIL: 29 errors and 186 warnings; errors are outside the modified Auto Cut files |

Browser tests mount the real component with controlled API responses; backend tests invoke the real route with temporary owned media and isolated demo-auth configuration. They do not change authentication configuration on the running server. The export test renders the generated timeline with the real Remotion renderer, verifies output duration/audio, then removes its isolated temporary files. An initial browser-harness environment-definition error was corrected before the successful run.

Remaining scope: scene/audio heuristics are not semantic video AI. Cooking action recognition, spoken-meaning recognition, repeated-scene recognition, and durable background job recovery remain unimplemented. Automatic assembly supports original speed and cuts; other transitions can be added in the existing timeline editor. Audio analysis uses the first audio track. Real-content quality across all ten categories and a signed-in upload-to-export browser journey have not been certified. Repository-wide lint has unrelated existing errors; Auto Cut checks are reported separately.

Changed files: `src/app/api/clipping-studio/auto-cut/route.ts`, `src/app/auto-cut/page.tsx`, `src/components/clipping-studio/AutoCutStudio.tsx`, `src/lib/auto-cut/analyzer.ts`, `src/lib/auto-cut/optimizer.ts`; new `src/lib/auto-cut/reel-bridge.ts`; updated `tests/auto_cut_intelligence.test.ts`; new `tests/browser/auto-cut.spec.ts` and its two fixture files. Existing unrelated working-tree edits were preserved.

## Original audit (before fixes)

Verdict at audit time: partial implementation; not ready to claim the supplied specification is complete. Application source was not changed during the initial audit.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; Auto Cut filesystem access triggers a whole-project tracing warning |
| `npm run lint` | FAIL: 29 errors, 203 warnings across the repository; not all attributable to Auto Cut |
| `npm run test:autocut` | PASS, six existing test groups including a generated 8-second FFmpeg video |
| `npm run test:studio` | PASS |
| `npm run test:timeline` | PASS, including real media fixtures |
| `npm run test:caption-sync` | PASS, including a rendered FFmpeg fixture |
| Live Chrome `/auto-cut` | Sign-in gate loads without page exceptions; sign-in dialog opens |
| Anonymous Auto Cut POST | Returns HTTP 401 |
| Sign-in gate widths 1440 and 390 | No horizontal document overflow |

Live browser used a fresh, unauthenticated Chrome context against the existing server. This does not establish that the authenticated editor is responsive or that an authenticated upload-to-export workflow succeeds.

## Findings

1. **Critical: media ownership is not enforced by the new API.** `src/app/api/clipping-studio/auto-cut/route.ts` authenticates the caller but never checks that caller's access to the project/media. The direct file branch restricts access to the shared storage root, not the user's media. The project branch constructs paths from an unvalidated `projectId` without the safe-path check used in the direct branch. Reuse the existing `clippingProjectAccess` and media access protections. This is a source-confirmed defect; a live cross-account exploit was not attempted.

2. **High: duration scaling creates invalid source ranges.** In `src/lib/auto-cut/optimizer.ts`, normalization multiplies source durations without enforcing the original candidate or media end. Executed reproduction: one candidate covering 0–8000 ms, target 30 seconds, returns 0–30000 ms and reports 30000 ms achieved. This is not valid footage assembly. Expansion can also overlap adjacent candidate ranges.

3. **High: advertised cooking recognition is a heuristic with invented semantic labels.** `src/lib/auto-cut/analyzer.ts` assigns cooking phases by relative timeline position and a calculated score; it does not inspect objects/actions or call a visual AI model. The score includes `Math.sin(midSec * 1.5)`. Cooking detection also treats sufficiently segmented videos with few audio intervals as cooking. Non-silent audio is treated as speech without speech recognition, so music and tone audio cannot reliably be distinguished from dialogue. Existing tests validate expected heuristic outputs rather than recognition accuracy.

4. **High: Reel Maker handoff does not transfer the sequence.** `AutoCutStudio.tsx` passes only `selected[0]` as `sourceMedia/start/end` query parameters. The current Caption Maker entry flow consumes project/clip/saved-reel parameters instead. There is no demonstrated multi-clip handoff through the existing project bridge.

5. **High: timeline integration drops edit settings.** The actual Add to Timeline handler calls `createClipsBulk` with names and source ranges only. It does not invoke `autoCutClipsToTimelineClips`, transfer speed or transitions, or assemble the Professional Timeline sequence required by the specification. Even the unused timeline converter does not transfer playback speed. Executed reproduction: fast clips report 30000 ms, but at their requested 1.15x speed their playback duration is about 26087 ms.

6. **Medium: rejected candidates can be restored.** Executed reproduction: passing a candidate with `selected: false` as the only optimizer input still returns that candidate, because an empty selected pool falls back to all candidates. The current UI disables adding zero selected clips, but the optimizer itself violates the selection contract.

7. **Medium: review is incomplete and duration display can become stale.** The UI stores assembled clips instead of all analysis candidates, preventing review/restoration of discarded candidates. Select All / Deselect All changes selection without recalculating achieved duration. Individual selection toggles do recalculate it.

8. **Medium: several controls are ineffective or incomplete.** `intensity` and `sceneSelection` are accepted but unused by analysis/optimization. Cinematic, custom and auto-highlight share the same optimizer branch. Silence levels other than aggressive do not have distinct filtering behavior. Slow and dynamic pacing are not distinctly implemented. Progress stages are timer driven, rather than actual backend progress. No cancellation or durable background job is implemented in the new synchronous route.

9. **Medium: invalid settings silently become defaults.** The route ignores schema-validation failures and performs default analysis instead of reporting invalid input.

## Limits and next validation

No authenticated real-video upload, complete Auto Cut export, cloud persistence, cross-account HTTP authorization test, cancellation/retry workflow, or visual-quality review of cooking/podcast/tutorial edits was completed. The ten real-content categories from the supplied brief were not available as a supplied test corpus. Existing regression suite success does not prove new Auto Cut integration compatibility.

Prioritize ownership/path validation, valid source bounds and playback-duration accounting, then the existing project bridge and Professional Timeline integration. Replace unsupported AI claims with accurate heuristic descriptions or implement and evaluate real recognition. Add regression tests for these reproduced cases before retesting complete authenticated workflows.
