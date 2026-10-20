# Test Guide: AI Reel Studio & Clip Finder

This document describes the automated test matrix, verification procedures, and regression test suites for **ReelSpark** (`/` Clip Finder and `/caption-maker` AI Reel Studio).

---

## 1. Automated Test Execution

Run the complete 60-suite test runner:

```bash
# Direct node execution (reliable across Windows CMD and Linux)
cmd.exe /c node ./node_modules/tsx/dist/cli.mjs tests/test_suite.ts
```

Or via pnpm:
```bash
pnpm test
```

To run the Next.js production build and TypeScript compilation audit:
```bash
pnpm build
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

Before releasing or deploying changes:
1. **Automated Unit & Integration Tests**:
   Ensure all core tests pass with 0 failures:
   ```bash
   pnpm test
   ```
2. **Specialized Safe-Zone & Preset Test Suites**:
   ```bash
   # Social Media Reel Safe-Zone Measurement System
   pnpm test:safe-zone

   # Caption & Thumbnail Safe-Zone Two-Way Sync
   pnpm test:safe-sync

   # Presets Comprehensive Analysis & Isolation
   pnpm test:presets
   ```
3. **Next.js Compilation & Type-Checking**:
   Ensure all static and dynamic routes compile cleanly with zero TypeScript errors:
   ```bash
   pnpm typecheck
   pnpm build
   ```
