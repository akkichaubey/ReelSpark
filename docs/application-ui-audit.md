# Application UI audit and migration plan — 2026-10-29

Status: in progress. This is a migration ledger, not a claim of complete manual or browser coverage.

## Current execution checkpoint — 2026-10-30

- User runs the application at `http://localhost:3000/` in another Cmder session. **Do not start or restart an application server.** Use that existing server for subsequent browser verification. Do not reload an unsaved editor session.
- The existing authenticated dashboard and Reel Maker are visible in Chrome on port 3000. Browser input was stopped when concurrent user input was detected; do not interfere with the user's editing.
- Added optional persistent dark/light theme (dark default), local appearance buttons and media palette isolation. No production configuration/data changes or deployment.
- Added manually configured local shadcn-style Button and Radix Dialog primitives. Auth, AI settings, help, export, history and mobile navigation use the shared dialog behavior. Native media controls remain custom.
- Confirmed and fixed development loopback login rejection caused by canonical localhost URLs versus actual 127.0.0.1 Host. Production canonical HTTPS checks remain strict. Regression tests cover Host/origin/port spoofing and IPv6.
- Restored the missing Project History entry point; the existing snapshot/import/export component was unreachable. Header actions wrap on narrow widths rather than clipping the additional history control.
- Added portable-project import validation and missing legacy defaults. Roundtrip tests preserve multilingual timing, full timeline, styles and media URLs.
- Added an accurate accessible range/value label to the timeline resize handle. The existing resize gesture math remains unchanged.
- Fixed mobile drawer reopening/stealing modal focus after switching to desktop and back. Its desktop transition now closes drawer state; the close callback is stable.
- Current typecheck and new Button/import/origin contract tests PASS. Current full lint still has the same 36 errors / 185 warnings as baseline; no added per-file/rule/severity findings.
- Real Remotion render regression PASS: gap/red/blue sequence, text pixels, exact three-second timebase, scoped range streaming, cross-dissolve and measured audio fades.
- Prior isolated browser checks PASS: loopback sign-in, auth mode switching, help focus wrapping/Escape/focus return, mobile drawer focus wrapping/desktop recovery, synthetic saved-reel loading and frame seeking, light/dark preview colors/geometry and unchanged playhead position.
- Preview screenshots are not byte-identical: the measured region differs by at most 6/255 per channel on 2,830 of 102,720 pixels. Computed caption colors/opacity/geometry match. Record this tolerance; do not claim exact pixel identity.
- Visual baselines exist at requested widths for default dashboard, editor, Studio, Saved Reels, Social generator/accounts/history/guidelines, help/settings/export/history dialogs and mobile drawer. Some history mobile baselines were reconstructed using the original clean HEAD component in the isolated fixture after correcting an overlapping-drawer capture. The fixture component was restored afterwards.
- **Still pending:** remaining component migration decisions/manual reviews, matching after screenshots across all routes/states, full history workflow browser checks, comprehensive existing-server interaction QA, and final production build/report. Live Google OAuth, cloud durability and real social publishing remain untested without approved test integrations. Full application QA is **not complete**.

### Latest checks on the current source

| Check | Result | Evidence / limit |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` on current component/import/origin changes |
| Main test suite | PASS | 63 / 63; `storage/application-audit-test-current.log` |
| Server regression suites | PASS | 22 suites, including new loopback-origin cases; `storage/application-audit-server-current.log` |
| Button contract | PASS | Native form/type/disabled/classes/icon attributes and asChild link composition |
| Portable project import | PASS | Valid raw/wrapped roundtrip, multilingual timing/media/timeline retention, legacy defaults, malformed-input recovery |
| Production build | PASS | `storage/application-audit-build-current.log`; build only, not deployment or server launch |
| Full lint | FAIL (existing findings remain) | Reduced from 36 to 29 errors; 185 warnings unchanged. No added per-file/rule/severity findings. `storage/application-audit-lint-current.json` |
| Existing user server | PASS (observed) | Authenticated dashboard and Reel Maker on `localhost:3000`; no reload or data edits |
| Current-server theme/dialog actions | NOT TESTED in this continuation | Concurrent user input stopped automation; earlier isolated-browser evidence is separate |
| Full visual regression | INCOMPLETE | 74 before images, 18 after-dark images, one after-light image; not every state has a matching pair |
| Live Google / D1 / R2 / publishing | NOT TESTED | No production credentials, data changes or publishing performed |

The production-build step is complete; the remaining interaction/migration and
comprehensive reporting work listed above is still pending. Small existing JSX
quote-escaping and immutable-variable lint findings were corrected without
changing rendered text or behavior. The completed subsequent full lint run
confirmed those seven errors removed; the remaining 29 errors and 185 warnings
are not represented as a passing lint check.

## Constraints and baseline

- Preserve the existing dark appearance, editor calculations, renderers, data formats, account isolation and API contracts. The additional requested light theme is opt-in; dark stays the default.
- Do not deploy, migrate databases, change production configuration, use live publishing credentials or modify user drafts.
- Existing checkout contains extensive uncommitted timeline / saved-reel work. Preserve it.
- Next 16.4.2, React 19.3, Tailwind 4, TypeScript 5; `@/*` resolves to `src/*`. Read installed Next client-component and pre-hydration guides before implementation.
- Existing CSS is custom dark/zinc/amber, with focus-visible and reduced-motion support. No existing shadcn/Radix component library.
- Baseline: typecheck PASS; build PASS; npm test PASS; verify:server PASS (21 suites). Full lint FAIL: 36 errors, 185 warnings across 264 files. Raw baseline logs are in `storage/application-audit-*-baseline.*`.
- Browser automation works in a dedicated Chrome tab. The user's in-app browser draft must not be reloaded. Initial landing screenshots at 1440/1280/768/390/375 and auth at 1440 are under `storage/ui-audit/before`.
- Production mode correctly rejects local authentication without its canonical HTTPS origin. Authenticated browser fixtures need a separate **development** instance with isolated storage and no cloud credentials; never weaken production origin validation for QA.

## Route/module review ledger

| Surface | Existing implementation / dependencies | Findings and migration decision |
| --- | --- | --- |
| `/` landing | WorkspaceDashboard, Navbar, LandingHero, AuthModal; same route hosts authenticated dashboard | Keep hero/cards/branding/gradients. Shared theme control; improve modal focus and error announcements only after state baselines. |
| Dashboard | DashboardLayout/Sidebar/Header, project cards, creation/import, settings/help | Keep dimensions and responsive drawer; shared actions/forms are candidates. Drawer needs keyboard/focus review. |
| AI moments | ProjectCreator, analysis progress, candidate ranking/filter/search, ClipCard/editor/player/subtitle review | Keep media logic and AI contracts. Standard modal behavior candidates; media playback/timestamp controls remain custom. |
| `/reel-maker`, `/caption-maker` alias | CaptionProject, account-scoped draft/history, explicit Saved Reel edits, ProfessionalTimeline, Remotion Player, legacy caption timeline | Keep both routes/query compatibility, all source clocks, linked track operations, waveform extraction, gestures, undo, rendering and file retention. Standard forms/dialog shells only after baseline coverage. |
| Caption/thumbnail panels | TranscriptEditor, CaptionStylePanel, ThumbnailStylePanel, CaptionPreview, ThumbnailPreview, SafeAreaOverlay | Keep measured caption/thumbnail appearance. Isolate output colors from application theme. Preserve font loading, GSAP/timing, canvas and safe zones. |
| `/clipping-studio` | StudioShell, Zustand store, account-local/cloud projects; media/AI/timeline/merge/export URL tabs | Keep custom InteractiveTimeline, preview shortcuts, merge/export plans and bridges. Do not replace specialized controls with generic sliders. |
| Saved Reels | Independent retained media, owner/revision checks, pagination/filter/sort, preview, duplicate/rename/delete/re-edit | Keep media retention and optimistic concurrency. Existing native destructive confirmations remain until equivalent behavior is verified. |
| `/social-post` generator | Platform rules, CTA presets, link preferences, validation | Shared fields/actions candidates; keep generator logic. Existing lint findings recorded separately. |
| Social accounts | Account-scoped cache, connections/preferences, OAuth credential modal | Do not expose credentials or alter token handling. Modal/form primitives only. |
| Publishing/history | Jobs, retry/progress, provider dispatch, signed ingest, encrypted tokens | Keep contracts and runtime origin security. Real publishing BLOCKED without approved test account; mock/security regression suites available. |
| Settings/auth/profile | Auth store, providers, Google state/session cookies, AI provider settings | Keep server boundaries and config. Custom auth dialog lacks keyboard focus management; focus currently stays on launcher. |
| Loading/error/support | SiteLoader, route loading/error, MediaErrorHandler, contact form | Retain support submission semantics; no external submission during QA. Avoid suppressing unrelated errors. |
| Backend/media/storage | Ownership/path/origin validation, private R2/D1 flags, reference retention, lifecycle, FFmpeg/FFprobe and render jobs | No UI-driven schema/backend rewrite. Isolated server suites pass. Live D1/R2 are not exercised. |
| Deployment | Node 24.22.1 Docker, FFmpeg/Chromium/fonts, Render, Linux regression workflow | Keep build/runtime compatible. No deployment authorized by this brief. |

## UI inventory decisions

| Family | Decision / compatibility boundary |
| --- | --- |
| Standard buttons/icon actions | shadcn-style local Button with explicit appearance-preserving variant; preserve native submit defaults, refs, events and exact existing class strings. No blanket styling. |
| Inputs/textareas/native selects | Local wrappers are suitable where native semantics are sufficient. Keep browser validation, controlled state, file inputs, range inputs and picker behavior. |
| Standard dialogs | Radix/shadcn composition can add focus trap/Escape/restore. Preserve existing overlay/content classes and positioning. Do not migrate unbaselined dialogs. |
| Tabs/dropdowns/checkboxes/switches | Retain native implementations where they work. Migrate only with full keyboard/URL/controlled-state compatibility. Searchable CTA dropdown is not a simple select. |
| Cards/badges/tables/pagination | Retain markup/classes; wrappers only where duplication demonstrably benefits maintenance. |
| Progress/skeleton/empty/error/toasts | Preserve content and layout; add appropriate live-region semantics without changing dimensions. |
| Sidebar/drawer | Retain approved width/breakpoints. Dialog focus management is a candidate, not a redesign. |
| Media timelines/sliders/scroll areas | Keep custom pointer math, scroll/zoom, keyboard shortcuts, source bounds and playback synchronization. Generic primitives must not intercept editor gestures. |
| Canvas/video/captions/thumbnail output | Never inherit light-mode palette. Preview and export must agree. |

## Incremental execution plan

1. Finish route/component inventory and protected-state fixtures; capture matching baseline states at requested widths. Mark unavailable states explicitly.
2. Add the official shadcn Next.js theme-provider pattern (`next-themes`, compatible React 19 peers), default dark, persistent local preference; one shared accessible toggle in navigation. No CLI init or global stylesheet replacement.
3. Add scoped light palette and semantic tokens while retaining original dark values. Protect media output scopes. Compare dark screenshots and exercise light controls at requested widths.
4. Add minimal local shadcn primitives only when used. Migrate small verified groups, preserve classes and existing APIs, check keyboard/focus/events after each group. Do not count installed-but-unused primitives as migration.
5. Run typecheck/lint/build/server and feature suites. Compare new lint output to baseline. Test real FFmpeg/Remotion output where feasible, not only source-string checks.
6. Maintain PASS/FAIL/BLOCKED/NOT TESTED ledger and complete page/state coverage before asserting full application QA. No blanket zero-regression claim.

## Official references

- https://ui.shadcn.com/docs/installation/manual
- https://ui.shadcn.com/docs/dark-mode/next
- https://ui.shadcn.com/docs/components/radix/button
- https://ui.shadcn.com/docs/components/radix/dialog

Use manual scoped integration. Do not import default shadcn CSS or overwrite existing design tokens/configuration.
# Shared control integration checkpoint — 2026-10-30

Thumbnail follow-up (2026-10-31): virtualized video frame strips, adaptive source
samples, a muted hover preview and processing/loading/retry states are implemented.
Source/viewport/zoom and real-media cache/access regressions pass. Browser hover,
zoom appearance, retry and touch gestures remain pending. Existing rules are kept.

Motion follow-up (2026-10-31): added a shared-control motion inspector, accessible
Bezier handles, graph preview, copy/paste and presets. Motion model/markup,
phase-continuity and persistence checks pass, with all 63 main tests. Browser
curve gestures and fresh export/pixel QA remain pending. Media playback-speed
ramps are not part of this animation-clock implementation. Existing rules stay.

Caption follow-up (2026-10-31): word controls now render within caption clips,
using shared Input/Button components and accessible timing sliders. Source edits
share data with Transcript and export. Viewport rendering bounds DOM growth.
Typecheck, caption/timeline regressions and all 63 main tests passed; new browser
pointer/keyboard, provider sync and movie checks remain pending. Existing rules
and historical verification records below are retained.

Audio follow-up (2026-10-31): added source-time keyframe controls, independent
audio fades, selected-clip range handles, solo and detach/resync. Native ranges
are intentionally retained for specialized clip editing. New browser pointer,
touch, keyboard and listening checks remain PENDING; model, source timing and
rendered-handle markup checks pass. Existing Markdown rules are preserved.

Follow-up: Social Copywriter and Thumbnail Creator now also use the shared
dialog composition. Thumbnail settings are saved by the same callback on button
close and Escape. Added explicit shared Button variants/sizes while retaining
the legacy default for existing callers. Typecheck, shared control contracts,
timeline scrubbing/delete/undo and caption preview checks passed after this
follow-up. Shared primitive lint passed; full browser coverage remains pending.

- Standardized 585 additional application buttons, 74 text/number/dynamic-type
  inputs and 11 textareas on local shadcn-derived primitives. Kept caller classes,
  attributes, handlers, React 19 refs, children and native submit defaults.
- Subtitle preview, Smart Editor and OAuth developer settings now compose
  `DialogSurface` and `DialogTitle`, retaining existing overlay/content classes.
  Icon-only close controls have explicit accessible names.
- Specialized ranges, file/color pickers, checkboxes, waveform gestures and media
  rendering remain custom. No server was started or restarted.
- PASS: typecheck, 63/63 main tests, Button and field contracts, timeline
  scrubbing/delete/undo checks, timeline QA regressions, voice/background checks,
  and caption preview combinations. Shared UI primitives are lint-clean.
- Existing `react-hooks/set-state-in-effect` findings remain in the three
  migrated dialogs; their effects were not changed by this integration.
- Browser visual verification is NOT COMPLETE: the native screenshot returned
  an unrelated active browser surface despite selecting the returned ReelMaker
  window. No browser input was sent. Do not treat these automated results as
  full responsive or keyboard-interaction browser coverage.

