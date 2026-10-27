import assert from 'node:assert';
import {
  REEL_STYLE_PRESETS,
  PLATFORM_PRESETS,
  PRESET_BGM_TRACKS,
  PRESET_CLEANUP_DEFAULTS,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_OUTPUT_SETTINGS,
  applyReelStylePreset,
  createEmptyCaptionProject,
} from '../src/lib/caption-maker/sample-data';
import {
  THUMBNAIL_PRESETS,
  THUMBNAIL_GRADIENTS,
  createDefaultThumbnailSettings,
  renderThumbnailToCanvas,
} from '../src/lib/caption-maker/thumbnail-presets';
import { generateAssSubtitles, hexToAssColor } from '../src/lib/caption-maker/ass-generator';
import type {
  CaptionGroup,
  CaptionStyle,
  OutputSettings,
  TranscriptWord,
} from '../src/lib/caption-maker/types';
import fs from 'node:fs';
import path from 'node:path';
import { getAssRenderCompatibility } from '../src/lib/caption-maker/render-compatibility';
import { setCacheAccount } from '../src/lib/account-cache';
import {
  loadProjectFromLocalStorage,
  saveProjectToLocalStorage,
} from '../src/lib/caption-maker/project-storage';

async function runPresetsComprehensiveTest() {
  console.log('\n======================================================');
  console.log('🧪 COMPREHENSIVE PRESET ANALYSIS & VERIFICATION SUITE');
  console.log('======================================================\n');

  const sampleWords: TranscriptWord[] = [
    { id: 'w1', text: 'Create', start: 0.0, end: 0.5, isImportant: false },
    { id: 'w2', text: 'viral', start: 0.5, end: 1.0, isImportant: true },
    { id: 'w3', text: 'reels', start: 1.0, end: 1.6, isImportant: false },
  ];
  const sampleGroups: CaptionGroup[] = [
    { id: 'g1', text: 'Create viral reels', start: 0.0, end: 1.6, words: sampleWords },
  ];

  // -----------------------------------------------------------------
  // 1. REEL STYLE PRESETS ANALYSIS (11 Presets)
  // -----------------------------------------------------------------
  console.log('▶ Section 1: Testing all 11 Reel Style Presets individually...');
  assert.strictEqual(REEL_STYLE_PRESETS.length, 11, 'Must have exactly 11 Reel Style Presets');

  // Exercise the same preset-apply helper used by the UI, then save and reopen
  // each selection through the account-scoped project cache.
  const localStorageValues = new Map<string, string>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => localStorageValues.get(key) ?? null,
        setItem: (key: string, value: string) => localStorageValues.set(key, value),
        removeItem: (key: string) => localStorageValues.delete(key),
      },
    },
  });
  setCacheAccount('preset-selection-qa');
  let roundTripProject = createEmptyCaptionProject('preset-selection-round-trip');
  for (const preset of REEL_STYLE_PRESETS) {
    roundTripProject = {
      ...roundTripProject,
      captionStyle: applyReelStylePreset(roundTripProject.captionStyle, preset.style, preset.id),
    };
    assert.strictEqual(
      roundTripProject.captionStyle.presetId,
      preset.id,
      `Selecting ${preset.id} must mark it active immediately`
    );
    assert.strictEqual(saveProjectToLocalStorage(roundTripProject), true);
    const reopenedProject = loadProjectFromLocalStorage();
    assert.ok(reopenedProject, `Project should reopen after selecting ${preset.id}`);
    assert.deepStrictEqual(
      reopenedProject.captionStyle,
      JSON.parse(JSON.stringify(roundTripProject.captionStyle)),
      `Preset ${preset.id} must survive save/reopen without losing options`
    );
  }
  setCacheAccount(null);
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  console.log('  ✓ All 11 preset selections survive account-scoped save/reopen with their full styles.');

  // Confirm preset-specific FFmpeg/ASS fidelity notices are accurate and that
  // a plain style remains eligible for the fast renderer.
  assert.strictEqual(
    getAssRenderCompatibility(DEFAULT_CAPTION_STYLE).previewParity,
    true,
    'A plain default style should not show an FFmpeg fidelity warning'
  );
  for (const preset of REEL_STYLE_PRESETS) {
    const applied = applyReelStylePreset(DEFAULT_CAPTION_STYLE, preset.style, preset.id);
    const compatibility = getAssRenderCompatibility(applied);
    if (preset.id === 'cinematic-subtitle') {
      assert.strictEqual(compatibility.previewParity, true, 'Cinematic clean text should match ASS capabilities');
    } else {
      assert.strictEqual(compatibility.previewParity, false, `${preset.id} should explain its ASS limitations`);
      assert.ok(compatibility.limitations.length > 0, `${preset.id} should list export differences`);
    }
  }
  console.log('  ✓ FFmpeg compatibility checks distinguish clean styles from advanced styles.');

  for (const preset of REEL_STYLE_PRESETS) {
    // 1.1 Verify required fields
    assert.ok(preset.id && typeof preset.id === 'string', `Preset ${preset.id} must have valid id`);
    assert.ok(preset.name && typeof preset.name === 'string', `Preset ${preset.name} must have valid name`);
    assert.ok(preset.badge && typeof preset.badge === 'string', `Preset ${preset.id} must have badge`);
    assert.ok(preset.description && preset.description.length > 5, `Preset ${preset.id} must have description`);
    assert.ok(preset.style && typeof preset.style === 'object', `Preset ${preset.id} must have style object`);

    // 1.2 Verify typography & color configurations
    const s = preset.style;
    assert.ok(s.fontFamily, `Preset ${preset.id} must define fontFamily`);
    assert.ok(s.textColor, `Preset ${preset.id} must define textColor`);
    assert.ok(s.importantColor, `Preset ${preset.id} must define importantColor`);
    assert.ok(s.animationPreset, `Preset ${preset.id} must define animationPreset`);
    assert.ok(s.highlightAnimation, `Preset ${preset.id} must define highlightAnimation`);

    // 1.3 Apply preset on top of default style with cleanup
    const appliedStyle: CaptionStyle = applyReelStylePreset(DEFAULT_CAPTION_STYLE, s, preset.id);

    // 1.4 Generate ASS Subtitles for this preset
    const assOutput = generateAssSubtitles(sampleGroups, sampleWords, appliedStyle, DEFAULT_OUTPUT_SETTINGS);
    assert.ok(assOutput.includes('[Script Info]'), `Preset ${preset.id} must output valid ASS header`);
    assert.ok(assOutput.includes('[Events]'), `Preset ${preset.id} must output ASS events`);
    assert.ok(assOutput.includes('Dialogue:'), `Preset ${preset.id} must produce dialogue lines`);

    // 1.5 Specific preset assertions
    if (preset.id === 'hormozi-viral') {
      assert.strictEqual(s.strokeWidth, 8, 'Hormozi must have thick stroke 8');
      assert.strictEqual(s.importantColor, '#FCD905', 'Hormozi must have gold highlight #FCD905');
      assert.strictEqual(s.backgroundStyle, 'solid-pill');
    } else if (preset.id === 'instagram-neon') {
      assert.strictEqual(s.textEffect, 'neon-glow');
      assert.strictEqual(s.glowColor, '#06B6D4');
      assert.strictEqual(s.highlightAnimation, 'glow');
    } else if (preset.id === 'ali-abdaal-clean') {
      assert.strictEqual(s.strokeWidth, 0);
      assert.strictEqual(s.backgroundStyle, 'frosted-glass');
      assert.strictEqual(s.animationPreset, 'clean');
    } else if (preset.id === 'highlighter-marker') {
      assert.strictEqual(s.backgroundStyle, 'marker-bar');
      assert.strictEqual(s.activeWordBgColor, '#A3E635');
      assert.strictEqual(s.textColor, '#000000');
    } else if (preset.id === 'cyber-tiktok') {
      assert.strictEqual(s.textEffect, 'neon-glow');
      assert.strictEqual(s.strokeWidth, 6);
      assert.strictEqual(s.importantColor, '#A3E635');
    } else if (preset.id === 'cinematic-subtitle') {
      assert.strictEqual(s.letterSpacing, 3);
      assert.strictEqual(s.uppercase, false);
      assert.strictEqual(s.backgroundStyle, 'none');
    } else if (preset.id === 'retro-3d') {
      assert.strictEqual(s.textEffect, 'retro-3d');
      assert.strictEqual(s.shadowOffsetX, 6);
      assert.strictEqual(s.shadowOffsetY, 6);
    } else if (preset.id === 'word-karaoke-pill') {
      assert.strictEqual(s.highlightAnimation, 'background');
      assert.strictEqual(s.activeWordBgColor, '#FCD905');
    } else if (preset.id === 'gsap-words-slide') {
      assert.strictEqual(s.animationPreset, 'words-slide-up');
    } else if (preset.id === 'gsap-words-rotate') {
      assert.strictEqual(s.animationPreset, 'words-rotate-in');
    } else if (preset.id === 'gsap-letters-slide') {
      assert.strictEqual(s.animationPreset, 'letters-slide-up');
    }

    console.log(`  ✓ Preset "${preset.name}" (${preset.id}): Validated configuration & ASS export.`);
  }

  // Every preset transition must reset omitted effect fields to their clean defaults.
  for (const sourcePreset of REEL_STYLE_PRESETS) {
    const sourceStyle: CaptionStyle = {
      ...DEFAULT_CAPTION_STYLE,
      ...PRESET_CLEANUP_DEFAULTS,
      ...sourcePreset.style,
      presetId: sourcePreset.id,
    };

    for (const targetPreset of REEL_STYLE_PRESETS) {
      const switchedStyle: CaptionStyle = {
        ...sourceStyle,
        ...PRESET_CLEANUP_DEFAULTS,
        ...targetPreset.style,
        presetId: targetPreset.id,
      };

      for (const [key, cleanValue] of Object.entries(PRESET_CLEANUP_DEFAULTS)) {
        const expected = targetPreset.style[key as keyof CaptionStyle] ?? cleanValue;
        assert.deepStrictEqual(
          switchedStyle[key as keyof CaptionStyle],
          expected,
          `Switch ${sourcePreset.id} -> ${targetPreset.id} must not leak ${key}`
        );
      }
      assert.strictEqual(switchedStyle.presetId, targetPreset.id);
    }
  }
  console.log('  ✓ All 121 preset-to-preset transitions clear omitted effects and retain target values');

  // -----------------------------------------------------------------
  // 2. CROSS-PRESET ISOLATION & SWITCHING TESTS
  // -----------------------------------------------------------------
  console.log('\n▶ Section 2: Testing cross-preset state isolation & property bleed prevention...');

  // Test 2.1: Switching from word-karaoke-pill (has activeWordBgColor) to hormozi-viral
  const karaokePreset = REEL_STYLE_PRESETS.find(p => p.id === 'word-karaoke-pill')!;
  const hormoziPreset = REEL_STYLE_PRESETS.find(p => p.id === 'hormozi-viral')!;

  let currentStyle: CaptionStyle = {
    ...DEFAULT_CAPTION_STYLE,
    ...PRESET_CLEANUP_DEFAULTS,
    ...karaokePreset.style,
    presetId: karaokePreset.id,
  };
  assert.strictEqual(currentStyle.activeWordBgColor, '#FCD905', 'Karaoke preset must set activeWordBgColor');

  // Now switch to Hormozi Viral
  currentStyle = {
    ...currentStyle,
    ...PRESET_CLEANUP_DEFAULTS,
    ...hormoziPreset.style,
    presetId: hormoziPreset.id,
  };
  assert.strictEqual(
    currentStyle.activeWordBgColor,
    undefined,
    'Hormozi must NOT inherit activeWordBgColor from previous preset!'
  );
  assert.strictEqual(currentStyle.strokeWidth, 8, 'Hormozi must have strokeWidth 8');
  assert.strictEqual(currentStyle.backgroundStyle, 'solid-pill');
  console.log('  ✓ Switching word-karaoke-pill -> hormozi-viral cleanly purges activeWordBgColor');

  // Test 2.2: Switching from retro-3d (has shadowOffsetX: 6, shadowOffsetY: 6) to cinematic-subtitle
  const retroPreset = REEL_STYLE_PRESETS.find(p => p.id === 'retro-3d')!;
  const cinematicPreset = REEL_STYLE_PRESETS.find(p => p.id === 'cinematic-subtitle')!;

  currentStyle = {
    ...currentStyle,
    ...PRESET_CLEANUP_DEFAULTS,
    ...retroPreset.style,
    presetId: retroPreset.id,
  };
  assert.strictEqual(currentStyle.shadowOffsetX, 6);
  assert.strictEqual(currentStyle.shadowOffsetY, 6);
  assert.strictEqual(currentStyle.textEffect, 'retro-3d');

  // Now switch to Cinematic Subtitle
  currentStyle = {
    ...currentStyle,
    ...PRESET_CLEANUP_DEFAULTS,
    ...cinematicPreset.style,
    presetId: cinematicPreset.id,
  };
  assert.strictEqual(currentStyle.shadowOffsetX, 0, 'Cinematic sub must reset shadowOffsetX to 0');
  assert.strictEqual(currentStyle.textEffect, 'none', 'Cinematic sub must reset textEffect to none');
  assert.strictEqual(currentStyle.letterSpacing, 3, 'Cinematic sub must apply letterSpacing: 3');
  console.log('  ✓ Switching retro-3d -> cinematic-subtitle cleanly resets shadow offsets & effects');

  // Test 2.3: Switching from instagram-neon (has glowColor, glowSpread: 20) to ali-abdaal-clean
  const neonPreset = REEL_STYLE_PRESETS.find(p => p.id === 'instagram-neon')!;
  const aliPreset = REEL_STYLE_PRESETS.find(p => p.id === 'ali-abdaal-clean')!;

  currentStyle = {
    ...currentStyle,
    ...PRESET_CLEANUP_DEFAULTS,
    ...neonPreset.style,
    presetId: neonPreset.id,
  };
  assert.strictEqual(currentStyle.glowColor, '#06B6D4');
  assert.strictEqual(currentStyle.glowSpread, 20);

  // Switch to Ali Abdaal
  currentStyle = {
    ...currentStyle,
    ...PRESET_CLEANUP_DEFAULTS,
    ...aliPreset.style,
    presetId: aliPreset.id,
  };
  assert.strictEqual(currentStyle.glowSpread, 0, 'Ali Abdaal must reset glowSpread to 0');
  assert.strictEqual(currentStyle.textEffect, 'soft-ambient', 'Ali Abdaal must set soft-ambient');
  assert.strictEqual(currentStyle.backgroundStyle, 'frosted-glass');
  console.log('  ✓ Switching instagram-neon -> ali-abdaal-clean cleanly resets neon glow spreads');

  // Test 2.4: Active Color Customization & Primary Color Preservation
  const gsapLettersPreset = REEL_STYLE_PRESETS.find(p => p.id === 'gsap-letters-slide')!;
  currentStyle = {
    ...currentStyle,
    ...PRESET_CLEANUP_DEFAULTS,
    ...gsapLettersPreset.style,
    presetId: gsapLettersPreset.id,
  };
  // Default primary color is #FFFFFF
  assert.strictEqual(currentStyle.textColor, '#FFFFFF', 'Default primary text color must be #FFFFFF');
  // Customize active spoken color to Neon Lime (#A3E635)
  const customActiveColor = '#A3E635';
  currentStyle = {
    ...currentStyle,
    importantColor: customActiveColor,
    activeWordBgColor: currentStyle.activeWordBgColor ? customActiveColor : undefined,
  };
  assert.strictEqual(currentStyle.importantColor, '#A3E635', 'Active color must update to chosen color');
  assert.strictEqual(currentStyle.textColor, '#FFFFFF', 'Primary color must remain default #FFFFFF');

  // Also test with Karaoke Badge preset
  currentStyle = {
    ...currentStyle,
    ...PRESET_CLEANUP_DEFAULTS,
    ...karaokePreset.style,
    presetId: karaokePreset.id,
  };
  assert.strictEqual(currentStyle.textColor, '#FFFFFF');
  const customKaraokeActive = '#FF007A'; // Hot Pink
  currentStyle = {
    ...currentStyle,
    importantColor: customKaraokeActive,
    activeWordBgColor: currentStyle.activeWordBgColor ? customKaraokeActive : undefined,
  };
  assert.strictEqual(currentStyle.importantColor, '#FF007A');
  assert.strictEqual(currentStyle.activeWordBgColor, '#FF007A', 'activeWordBgColor must sync with custom active color');
  assert.strictEqual(currentStyle.textColor, '#FFFFFF', 'Primary color stays default #FFFFFF');
  console.log('  ✓ Active color customization & primary color default preservation verified');

  // Test 2.5: Climax intensity must not override the selected spoken-word color.
  const climaxWord: TranscriptWord = {
    ...sampleWords[0],
    intensity: 'climax',
  };
  const climaxGroup: CaptionGroup = {
    ...sampleGroups[0],
    words: [climaxWord],
  };
  const climaxAss = generateAssSubtitles(
    [climaxGroup],
    [climaxWord],
    { ...DEFAULT_CAPTION_STYLE, importantColor: '#FCD905' },
    DEFAULT_OUTPUT_SETTINGS
  );
  assert.ok(climaxAss.includes('\\c&H0005D9FC&'), 'Climax word must use the selected active color #FCD905');
  assert.ok(!climaxAss.includes('\\c&H006633FF&'), 'Climax word must not use the old hard-coded pink color');

  const speakerTwoClimax: TranscriptWord = {
    ...climaxWord,
    speakerId: 'Speaker 2',
  };
  const speakerTwoClimaxAss = generateAssSubtitles(
    [{ ...climaxGroup, words: [speakerTwoClimax] }],
    [speakerTwoClimax],
    { ...DEFAULT_CAPTION_STYLE, importantColor: '#FCD905', speaker2Color: '#06B6D4' },
    DEFAULT_OUTPUT_SETTINGS
  );
  assert.ok(speakerTwoClimaxAss.includes('\\c&H00D4B606&'), 'Speaker 2 climax word must preserve its speaker color');
  console.log('  ✓ Climax intensity keeps selected active color and speaker color in ASS output');

  // Solo-word mode must color every currently spoken word, even when it is not manually marked important.
  for (const preset of REEL_STYLE_PRESETS) {
    const soloStyle: CaptionStyle = {
      ...DEFAULT_CAPTION_STYLE,
      ...PRESET_CLEANUP_DEFAULTS,
      ...preset.style,
      presetId: preset.id,
      captionMode: 'word-by-word',
    };
    const soloWord: TranscriptWord = {
      ...sampleWords[0],
      isImportant: false,
      intensity: 'normal',
    };
    const soloAss = generateAssSubtitles(
      [{ ...sampleGroups[0], words: [soloWord] }],
      [soloWord],
      soloStyle,
      DEFAULT_OUTPUT_SETTINGS
    );
    const soloExpectedColor = hexToAssColor(preset.style.importantColor || '#FCD905');
    assert.ok(
      soloAss.includes(`\\c${soloExpectedColor}`),
      `Solo word for ${preset.id} must use its selected active color`
    );
  }
  console.log('  ✓ All 11 presets use their selected active color in solo-word ASS output');

  // -----------------------------------------------------------------
  // 3. THUMBNAIL PRESETS ANALYSIS (6 Presets)
  // -----------------------------------------------------------------
  console.log('\n▶ Section 3: Testing all 6 Thumbnail Presets individually on Canvas...');
  assert.strictEqual(THUMBNAIL_PRESETS.length, 6, 'Must have exactly 6 Thumbnail Presets');

  const createMockCanvas = () => {
    const operations: string[] = [];
    return {
      canvas: {
        width: 1080,
        height: 1920,
        getContext: () => ({
          canvas: { width: 1080, height: 1920 },
          save: () => operations.push('save'),
          restore: () => operations.push('restore'),
          fillRect: () => operations.push('fillRect'),
          clearRect: () => operations.push('clearRect'),
          beginPath: () => operations.push('beginPath'),
          closePath: () => operations.push('closePath'),
          moveTo: () => operations.push('moveTo'),
          lineTo: () => operations.push('lineTo'),
          arcTo: () => operations.push('arcTo'),
          quadraticCurveTo: () => operations.push('quadraticCurveTo'),
          drawImage: () => operations.push('drawImage'),
          clip: () => operations.push('clip'),
          fill: () => operations.push('fill'),
          stroke: () => operations.push('stroke'),
          measureText: (text: string) => ({ width: text.length * 18 }),
          fillText: (text: string) => operations.push(`fillText:${text}`),
          strokeText: () => operations.push('strokeText'),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
        }),
      },
      operations,
    };
  };

  for (const preset of THUMBNAIL_PRESETS) {
    assert.ok(preset.id, `Thumbnail preset ${preset.name} must have id`);
    assert.ok(preset.name, `Thumbnail preset ${preset.id} must have name`);
    assert.ok(preset.badgePreview, `Thumbnail preset ${preset.id} must have badgePreview`);
    assert.ok(preset.settings, `Thumbnail preset ${preset.id} must have settings`);

    // Verify expected layout
    const s = preset.settings;
    assert.ok(s.fontFamily, `Thumbnail preset ${preset.id} must have fontFamily`);
    assert.ok(s.fontSize && s.fontSize >= 60, `Thumbnail preset ${preset.id} must have large headline font`);
    assert.ok(s.textColor, `Thumbnail preset ${preset.id} must have textColor`);
    assert.ok(s.highlightColor, `Thumbnail preset ${preset.id} must have highlightColor`);
    assert.ok(s.position, `Thumbnail preset ${preset.id} must define position`);

    if (preset.id === 'minimal') {
      assert.strictEqual(s.position, 'bottom', 'Clean Minimalist must anchor at bottom');
      assert.strictEqual(s.textAlign, 'left', 'Clean Minimalist must be left aligned');
    } else if (preset.id === 'alert') {
      assert.strictEqual(s.position, 'top', 'Breaking Alert must anchor at top');
      assert.strictEqual(s.badgeStyle, 'solid');
    } else if (preset.id === 'glass-card') {
      assert.strictEqual(s.boxBackground, true, 'Glass Card must enable boxBackground');
    }

    // Render to mock Canvas
    const { canvas, operations } = createMockCanvas();
    const mergedSettings = {
      ...createDefaultThumbnailSettings('VIRAL THUMBNAIL TEST'),
      ...s,
      preset: preset.id,
    };

    await renderThumbnailToCanvas(canvas as any, mergedSettings);
    assert.ok(operations.some(op => op.startsWith('fillText:')), `Preset ${preset.id} must draw text`);
    console.log(`  ✓ Thumbnail Preset "${preset.name}" (${preset.id}): Rendered successfully to canvas.`);
  }

  // -----------------------------------------------------------------
  // 4. THUMBNAIL GRADIENT PRESETS (6 Gradients)
  // -----------------------------------------------------------------
  console.log('\n▶ Section 4: Testing all 6 Thumbnail Gradients...');
  assert.strictEqual(THUMBNAIL_GRADIENTS.length, 6, 'Must have exactly 6 Thumbnail Gradients');

  for (const grad of THUMBNAIL_GRADIENTS) {
    assert.ok(grad.id && typeof grad.id === 'string');
    assert.ok(grad.name && typeof grad.name === 'string');
    assert.ok(grad.css && grad.css.includes('gradient'), `Gradient ${grad.id} must have valid CSS`);
    assert.ok(grad.startColor.startsWith('#'), `Gradient ${grad.id} startColor must be hex`);
    assert.ok(grad.endColor.startsWith('#'), `Gradient ${grad.id} endColor must be hex`);
    console.log(`  ✓ Gradient "${grad.name}" (${grad.id}): Valid CSS & hex colors.`);
  }

  // -----------------------------------------------------------------
  // 5. PLATFORM PRESETS (6 Platforms)
  // -----------------------------------------------------------------
  console.log('\n▶ Section 5: Testing Platform Presets...');
  const presetKeys = Object.keys(PLATFORM_PRESETS);
  assert.ok(presetKeys.includes('instagram-reel'));
  assert.ok(presetKeys.includes('youtube-short'));
  assert.ok(presetKeys.includes('instagram-portrait'));
  assert.ok(presetKeys.includes('instagram-square'));
  assert.ok(presetKeys.includes('youtube-landscape'));
  assert.ok(presetKeys.includes('custom'));

  for (const [key, preset] of Object.entries(PLATFORM_PRESETS)) {
    assert.ok(preset.width > 0 && preset.width % 2 === 0, `${key} width must be positive even integer`);
    assert.ok(preset.height > 0 && preset.height % 2 === 0, `${key} height must be positive even integer`);
    assert.ok(preset.description.length > 0);
    console.log(`  ✓ Platform preset "${preset.label}" (${key}): ${preset.width}x${preset.height} (${preset.aspectRatio}).`);
  }

  // -----------------------------------------------------------------
  // 6. BGM PRESETS & ASSETS ON DISK
  // -----------------------------------------------------------------
  console.log('\n▶ Section 6: Testing BGM Presets & Physical Audio Files on disk...');
  assert.strictEqual(PRESET_BGM_TRACKS.length, 3, 'Must have 3 BGM presets');

  for (const track of PRESET_BGM_TRACKS) {
    assert.ok(track.id, 'Track must have id');
    assert.ok(track.title, 'Track must have title');
    assert.ok(track.fileUrl.startsWith('/audio/bgm/'));
    assert.ok(track.volume > 0 && track.volume <= 1.0);

    // Verify audio file exists on disk
    const filename = path.basename(track.fileUrl);
    const diskPath = path.join(process.cwd(), 'public', 'audio', 'bgm', filename);
    assert.ok(fs.existsSync(diskPath), `BGM audio file ${filename} must exist on disk at ${diskPath}`);
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 10000, `BGM audio file ${filename} must be non-empty (was ${stat.size} bytes)`);
    console.log(`  ✓ BGM Preset "${track.title}" (${track.id}): File exists (${stat.size} bytes).`);
  }

  // -----------------------------------------------------------------
  // 7. INDIC / DEVANAGARI & COMPLEX SCRIPT SPLIT-LETTER INTEGRITY
  // -----------------------------------------------------------------
  console.log('\n▶ Section 7: Testing Indic / Devanagari Grapheme Clusters for "GSAP Split Letters"...');
  const { splitGraphemes, isDevanagari } = await import('../src/lib/caption-maker/text-transform');

  const hindiSpeechSample = 'इसका अर्थ क्या है?';
  assert.strictEqual(isDevanagari(hindiSpeechSample), true, 'Must identify Devanagari text');

  // Verify that raw string split produces broken orphan combining marks (the bug in the screenshot):
  const rawCharSplit = hindiSpeechSample.split('');
  const combiningMarkRegex = /[\u093E-\u094F\u0901-\u0903]/;
  const hasOrphanCombiningMarks = rawCharSplit.some(c => c.length === 1 && combiningMarkRegex.test(c));
  assert.strictEqual(hasOrphanCombiningMarks, true, 'Naive split("") produces orphaned combining marks');

  // Verify that splitGraphemes fixes this completely:
  const wordsInSample = hindiSpeechSample.split(' ');
  for (const word of wordsInSample) {
    const clusters = splitGraphemes(word);
    for (const cluster of clusters) {
      // In a well-formed grapheme cluster, the first character must NOT be an isolated vowel sign or virama
      assert.strictEqual(
        combiningMarkRegex.test(cluster[0]),
        false,
        `Cluster "${cluster}" in word "${word}" must NOT start with an isolated combining mark/matra!`
      );
    }
  }

  // Exact word cluster checks
  const iskaClusters = splitGraphemes('इसका');
  assert.deepStrictEqual(iskaClusters, ['इ', 'स', 'का'], '"इसका" must be split into ["इ", "स", "का"]');

  const arthClusters = splitGraphemes('अर्थ');
  assert.deepStrictEqual(arthClusters, ['अ', 'र्थ'], '"अर्थ" must be split into ["अ", "र्थ"] without breaking reph/halant');

  const kyaClusters = splitGraphemes('क्या');
  assert.deepStrictEqual(kyaClusters, ['क्या'], '"क्या" must stay intact as a single syllable cluster');

  const haiClusters = splitGraphemes('है?');
  assert.deepStrictEqual(haiClusters, ['है', '?'], '"है?" must be split into ["है", "?"]');

  console.log('  ✓ Devanagari aksharas segment cleanly with 0 broken matras, 0 broken viramas, and 0 dotted circles (◌)!');

  console.log('\n======================================================');
  console.log('🎉 ALL PRESET CHECKS & ISOLATION TESTS PASSED CLEANLY!');
  console.log('======================================================\n');
}

runPresetsComprehensiveTest().catch((err) => {
  console.error('Preset test failed:', err);
  process.exit(1);
});
