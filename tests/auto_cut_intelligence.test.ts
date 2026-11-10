import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { APP_CONFIG, getFfmpegPath } from '../src/lib/config';
import { AutoCutSettingsSchema, type AutoCutClipCandidate } from '../src/lib/auto-cut/types';
import { analyzeSemanticMoments } from '../src/lib/auto-cut/semantic';
import { generateWithOllama } from '../src/lib/ollama';
import { transcribeAutoCutAudio } from '../src/lib/cloudflare/ai';
import { analyzeMediaForAutoCut } from '../src/lib/auto-cut/analyzer';
import { optimizeDurationAndAssemble, autoCutClipsToTimelineClips } from '../src/lib/auto-cut/optimizer';
import { detectVisualIntervals } from '../src/lib/auto-cut/analyzer';
import { buildAutoCutScenes, reconcileAutoCutScenes, sceneCandidates } from '../src/lib/auto-cut/scenes';
import { validateAutoCutScenes } from '../src/lib/auto-cut/types';
import { assembleRecipe } from '../src/lib/auto-cut/recipe';
import { buildSpeechMoments, measureSpeechSignal, speechClip } from '../src/lib/auto-cut/speech';
import { prependHook, suggestHooks, trimHook } from '../src/lib/auto-cut/hooks';
import { applyDuplicateDecisions, clusterDuplicates } from '../src/lib/auto-cut/duplicates';
import { fingerprintDuplicateScenes } from '../src/lib/auto-cut/duplicate-fingerprints';
import { defaultQualityConfig, qualityWeights, scoreAutoCutQuality } from '../src/lib/auto-cut/quality';
import { measureQualityFrame, qualityFrameSize } from '../src/lib/auto-cut/quality-measurements';
import type { CookingActivity } from '../src/lib/auto-cut/types';
import { saveSavedReel, getSavedReel } from '../src/lib/saved-reels/storage';
import { resolveTimelineAsset, serveTimelineAssets } from '../src/lib/timeline/render-assets';
import { POST as authorizeBRoll } from '../src/app/api/clipping-studio/auto-cut/b-roll/route';
import { suggestBRoll, type BRollEdit } from '../src/lib/auto-cut/broll';
import { defaultNaturalTransitions, suggestTransition, transitionKey } from '../src/lib/auto-cut/natural-transitions';
import { setNaturalTimelineBoundary } from '../src/lib/timeline/natural-transitions';
import { audioGain } from '../src/lib/timeline/audio';
import { correlateCameraAudio, switchCameraRange, type CameraSync } from '../src/lib/auto-cut/multicamera';
import { POST as synchronizeCameras } from '../src/app/api/clipping-studio/auto-cut/sync/route';
import { renderRemotionReelVideo } from '../src/lib/caption-maker/remotion-renderer';
import { probeVideo } from '../src/lib/ffmpeg';
import { createAutoCutReel } from '../src/lib/auto-cut/reel-bridge';
import { compileTimeline, validateTimeline } from '../src/lib/timeline/model';
import { clippingProjectAccess } from '../src/lib/media-api-access';
import { GET as getAnalysisProgress, POST } from '../src/app/api/clipping-studio/auto-cut/route';
import type { MediaAsset } from '../src/lib/clipping-studio/contracts';

const candidate = (id: string, startMs: number, endMs: number): AutoCutClipCandidate => ({ id, startMs, endMs, durationMs: endMs - startMs,
  score: 80, confidence: 0, reason: 'Measured fixture', category: 'Test', visualActionScore: 70, audioScore: 70, selected: true, transitionToNext: 'cut', speedMultiplier: 1 });

async function main() {
  const settings = AutoCutSettingsSchema.parse({ targetDurationSeconds: 30 });
  assert.equal(settings.mode, 'auto_highlight');
  assert.equal(AutoCutSettingsSchema.safeParse({ targetDurationSeconds: -1 }).success, false);
  const short = optimizeDurationAndAssemble([candidate('short', 0, 8000)], settings);
  assert.equal(short.totalDurationMs, 8000); assert.equal(short.assembledClips[0].endMs, 8000);
  assert.equal(optimizeDurationAndAssemble([{ ...candidate('no', 0, 8000), selected: false }], settings).assembledClips.length, 0);
  assert.equal(optimizeDurationAndAssemble([], settings).totalDurationMs, 0);
  const pool = Array.from({ length: 30 }, (_, i) => candidate(`c${i}`, i * 5000, (i + 1) * 5000));
  const before = JSON.stringify(pool);
  let seed = 42;
  const signal = Array.from({ length: 700 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % 41 - 60; });
  assert.equal(correlateCameraAudio(signal, signal.slice(50), 150)?.offsetMs, 1000);
  assert.equal(correlateCameraAudio(signal.slice(50), signal, 150)?.offsetMs, -1000);
  assert.equal(correlateCameraAudio(signal, Array(650).fill(-60), 150), undefined);
  const movement = (id: string, startMs: number, x: number) => ({ ...candidate(id, startMs, startMs + 2000),
    visionProvider: 'fixture', actionTags: ['chopping'], objects: ['onion'],
    qualityMeasurements: { version: 1 as const, frames: [{ timeMs: startMs + 1000, edgeDetail: 9, luminance: 120,
      shadows: 0, highlights: 0, shift: Math.abs(x), motionX: x, motionY: 0 }] },
  });
  assert.equal(suggestTransition(movement('left', 0, 2), movement('right', 2000, 2), defaultNaturalTransitions).kind, 'action');
  assert.equal(suggestTransition(movement('left', 0, 2), movement('right', 2000, -2), defaultNaturalTransitions).kind, 'match');
  assert.equal(suggestTransition(movement('left', 0, 2), movement('right', 2000, -2), { ...defaultNaturalTransitions, profile: 'fast' }).kind, 'cut');
  assert.equal(suggestTransition(candidate('left', 0, 2000), candidate('right', 2000, 4000), defaultNaturalTransitions).kind, 'cut');
  const evidence = (startMs: number, bright: boolean) => ({ version: 1 as const, frames: [{ timeMs: startMs + 700,
    edgeDetail: bright ? 11 : 1.5, luminance: bright ? 125 : 18, shadows: bright ? 0.02 : 0.82, highlights: 0.01, shift: bright ? 0 : 3 }] });
  const darkStory: AutoCutClipCandidate = { ...candidate('dark-story', 0, 6000), analysisMethod: 'semantic', evidenceFrames: [700],
    qualityMeasurements: evidence(0, false), semanticQuality: { relevance: 100, story: 100, subject: 55, hook: 95 } };
  const beautifulBroll: AutoCutClipCandidate = { ...candidate('beautiful-broll', 6000, 12000), analysisMethod: 'semantic', evidenceFrames: [6700],
    qualityMeasurements: evidence(6000, true), semanticQuality: { relevance: 10, story: 15, subject: 95, hook: 30 } };
  const visualSettings = AutoCutSettingsSchema.parse({ mode: 'custom', targetDurationSeconds: 5,
    quality: { ...defaultQualityConfig, preference: 'Visual Quality' } });
  const storySettings = { ...visualSettings, quality: { ...defaultQualityConfig, preference: 'Storytelling' as const } };
  assert.equal(optimizeDurationAndAssemble([darkStory, beautifulBroll], visualSettings).assembledClips[0].id, 'beautiful-broll');
  assert.equal(optimizeDurationAndAssemble([darkStory, beautifulBroll], storySettings).assembledClips[0].id, 'dark-story');
  const lockedDraft = optimizeDurationAndAssemble([{ ...darkStory, locked: true }, beautifulBroll], visualSettings);
  assert.deepEqual(lockedDraft.assembledClips.map(clip => [clip.id, clip.startMs, clip.endMs]), [['dark-story', 0, 6000]]);
  assert.deepEqual(scoreAutoCutQuality(darkStory, storySettings), scoreAutoCutQuality(structuredClone(darkStory), storySettings));
  assert.notDeepEqual(qualityWeights(defaultQualityConfig, 'podcast'), qualityWeights(defaultQualityConfig, 'cinematic'));
  const darkStep = { ...darkStory, cookingActivity: 'mixing' as const,
    recipeEvidence: { ingredients: [], utensils: [], techniques: [], footage: 'step' as const, essential: true } };
  assert.ok(assembleRecipe([darkStep, beautifulBroll], { ...visualSettings, mode: 'cooking_recipe' })
    .assembledClips.some(clip => clip.id === darkStep.id));
  const grid = (shift: number) => Uint8Array.from({ length: qualityFrameSize ** 2 }, (_, index) =>
    ((Math.floor(((index % qualityFrameSize) + shift) / 8) + Math.floor(index / qualityFrameSize / 8)) % 2) * 140 + 50);
  assert.equal(measureQualityFrame(grid(0), 0, grid(0)).shift, 0);
  assert.equal(measureQualityFrame(grid(0), 0, grid(2)).shift, 2);
  const stir = { ...candidate('stir-a', 0, 3000), sourceVideoId: 'camera-a', category: 'Stir the pan',
    cookingActivity: 'mixing' as const, visionProvider: 'fixture', evidenceFrames: [1000],
    recipeEvidence: { ingredients: ['tomato'], utensils: ['pan'], techniques: [], footage: 'step' as const, essential: true } };
  const secondStep = { ...stir, id: 'stir-b', startMs: 4000, endMs: 7000, evidenceFrames: [5000],
    recipeEvidence: { ...stir.recipeEvidence, ingredients: ['onion'] } };
  const take = { ...secondStep, id: 'take-2', startMs: 8000, endMs: 11000, evidenceFrames: [9000],
    recipeEvidence: { ...stir.recipeEvidence, footage: 'repeat' as const } };
  assert.equal(clusterDuplicates([stir, secondStep], []).length, 0);
  assert.deepEqual(assembleRecipe([stir, secondStep], AutoCutSettingsSchema.parse({ mode: 'cooking_recipe' }))
    .assembledClips.map(clip => clip.id), ['stir-a', 'stir-b']);
  assert.equal(clusterDuplicates([stir, secondStep, take], [])[0].alternatives[0].match.kind, 'Possible alternate take');
  const excluded = [{ sourceVideoId: 'camera-a', startMs: 8000, endMs: 11000, value: 'exclude' as const }];
  assert.equal(applyDuplicateDecisions([{ ...take, id: 'reanalysis', startMs: 7950, durationMs: 3050 }], excluded)[0].selected, false);
  assert.equal(applyDuplicateDecisions([take], [{ ...excluded[0], value: 'keep' }])[0].duplicateKeep, true);
  const hookFootage = Array.from({ length: 6 }, (_, index) => ({
    ...candidate(`hook-${index}`, index * 4000, index * 4000 + 4000), visualActionScore: index === 0 ? 5 : 85,
  }));
  const hookOptions = suggestHooks(hookFootage, 2000, true);
  assert.equal(hookOptions.length, 5);
  assert.ok(hookOptions.every(hook => hook.clip.startMs >= 4000 && hook.style !== 'Recipe Result' && !hook.text));
  const shortHook = suggestHooks([{ ...candidate('short-silent', 0, 650), audioQuality: 'silent_signal' }], 2000, false)[0];
  assert.equal(shortHook.clip.endMs, 650);
  const reveal = { ...hookFootage[5], cookingActivity: 'presentation' as const, confidence: 90,
    evidenceFrames: [20500, 23100], hookEvidence: { resultMs: 23100 }, visionProvider: 'fixture' };
  const resultHook = suggestHooks([...hookFootage.slice(0, 5), reveal], 2000, true)[0];
  assert.equal(resultHook.style, 'Recipe Result');
  assert.equal(trimHook(resultHook, 20500, 22000).text, '', 'Remove the automatic label when the result frame is trimmed out');
  assert.equal(suggestHooks([{ ...reveal, hookEvidence: { resultMs: 23101 } }], 2000, true)[0].style, 'Visual Reveal');
  assert.equal(suggestHooks([{ ...reveal, hookEvidence: { beforeAfterMs: [20500, 23100] } }], 3000, false)[0].style, 'Before/After');
  assert.throws(() => trimHook(resultHook, -1, 2000), /source range/);
  const body = prependHook(hookFootage, resultHook);
  assert.equal(body[0].startMs, resultHook.clip.startMs);
  assert.deepEqual(body.slice(1, 6).map(clip => clip.id), hookFootage.slice(0, 5).map(clip => clip.id));
  assert.ok(body.slice(1).every(clip => clip.endMs <= resultHook.clip.startMs || clip.startMs >= resultHook.clip.endMs));
  assert.throws(() => prependHook([{ ...reveal, recipeImportance: 'required' }], resultHook), /required recipe step/);
  const question = { ...candidate('question', 0, 1000), speechHighlight: 'question' as const,
    speechTiming: 'provider_segment' as const, transcriptWords: [{ text: 'Why wait?', startMs: 200, endMs: 900 }] };
  const explanation = { ...candidate('explanation', 1000, 2500), speechHighlight: 'explanation' as const,
    speechTiming: 'provider_segment' as const, transcriptWords: [{ text: 'The pan needs to heat.', startMs: 1000, endMs: 2000 }] };
  assert.ok(suggestHooks([question], 2000, false).some(hook => hook.style === 'Question'));
  assert.ok(suggestHooks([question, explanation], 2000, false).some(hook => hook.style === 'Problem/Solution' && hook.clip.endMs === 2000));
  const speechWindows = [
    { ...candidate('speech-a', 0, 1000), speechLanguage: 'hinglish' as const, transcriptWords: [
      { text: 'अब', startMs: 120, endMs: 350 }, { text: 'mix', startMs: 500, endMs: 800 },
    ] },
    { ...candidate('speech-b', 1000, 3000), speechLanguage: 'hinglish' as const, speechHighlight: 'tip' as const, transcriptWords: [
      { text: 'करो।', startMs: 1050, endMs: 1300 }, { text: 'Why?', startMs: 1600, endMs: 1850 },
      { text: 'अभी', startMs: 1750, endMs: 2050 }, { text: 'um', startMs: 2300, endMs: 2400 },
    ] },
    { ...candidate('silent', 3000, 4000), audioQuality: 'silent_signal' as const, transcriptWords: [
      { text: 'Invented.', startMs: 3200, endMs: 3500 },
    ] },
  ];
  const moments = buildSpeechMoments(speechWindows);
  assert.deepEqual(moments[0].words.map(word => word.text), ['अब', 'mix', 'करो।']);
  assert.equal(moments[0].complete, true);
  assert.equal(moments[0].language, 'hinglish');
  assert.equal(moments[1].speaker, 'unknown');
  assert.equal(moments[1].complete, false, 'An overlapping turn cannot close on the first speaker punctuation');
  assert.equal(moments[1].fillerCount, 1);
  assert.equal(moments.length, 2);
  assert.throws(() => speechClip(moments[0], 250, 1300), /timed word/);
  const protectedClip = speechClip(moments[0]);
  assert.equal(protectedClip.durationMs, 1180);
  const paused = buildSpeechMoments([{ ...candidate('paused', 0, 4000), transcriptWords: [
    { text: 'Wait', startMs: 100, endMs: 450 }, { text: 'for it.', startMs: 2400, endMs: 2900 },
  ] }]);
  assert.equal(paused.length, 1);
  assert.equal(speechClip(paused[0]).durationMs, 2800, 'Preserve a meaningful pause inside a sentence');
  const interrupted = buildSpeechMoments([speechWindows[0], {
    ...speechWindows[1], startMs: 1025,
  }]);
  assert.equal(interrupted[0].complete, false, 'An unreviewed source gap cannot establish a complete sentence');
  const wav = Buffer.alloc(44 + 1600);
  wav.write('RIFF', 0); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16);
  wav.write('data', 36); wav.writeUInt32LE(1600, 40);
  assert.equal(measureSpeechSignal(wav), 'silent_signal');
  for (let sample = 44; sample < wav.length; sample += 2) wav.writeInt16LE(32700, sample);
  assert.equal(measureSpeechSignal(wav), 'clipped_signal');
  assert.equal(optimizeDurationAndAssemble([{ ...protectedClip, endMs: 7000, durationMs: 6880 }],
    AutoCutSettingsSchema.parse({ targetDurationSeconds: 5, mode: 'podcast' })).assembledClips.length, 0);
  console.log('PASS speech: mixed-language sentence across windows, unknown overlapping speakers, digital silence, clipping and protected boundaries');
  const stages: CookingActivity[] = ['washing', 'peeling', 'chopping', 'marinating', 'frying', 'spices', 'garnishing', 'presentation'];
  const cooking = stages.map((stage, index): AutoCutClipCandidate => ({
    ...candidate(stage, index % 4 * 5000, (index % 4 + 1) * 5000),
    sourceVideoId: index < 4 ? 'prep-angle' : 'stove-angle',
    cookingActivity: stage, category: stage, recipeOrder: index,
    recipeEvidence: { ingredients: [], utensils: [], techniques: [], footage: 'step', essential: true },
  }));
  const failed: AutoCutClipCandidate = { ...cooking[0], id: 'failed-take', recipeOrder: 8,
    recipeEvidence: { ingredients: [], utensils: [], techniques: [], footage: 'failed_take', essential: false } };
  const repeated: AutoCutClipCandidate = { ...cooking[4], id: 'repeat', sourceVideoId: 'extra-angle', recipeOrder: 9,
    recipeEvidence: { ingredients: [], utensils: [], techniques: [], footage: 'repeat', essential: true } };
  for (const recipeStyle of ['recipe', 'cinematic', 'quick_tip', 'step_by_step'] as const) {
    for (const targetDurationSeconds of [15, 30, 40, 60, 23]) {
      const result = assembleRecipe([...cooking, failed, repeated], AutoCutSettingsSchema.parse({ mode: 'cooking_recipe', recipeStyle, targetDurationSeconds }));
      assert.deepEqual(result.assembledClips.map(clip => clip.cookingActivity), stages);
      assert.ok(result.totalDurationMs <= targetDurationSeconds * 1000);
      assert.equal(result.omittedSteps.length, 0);
      assert.ok(result.hasFinalDish);
    }
  }
  const shortRecipe = assembleRecipe(cooking, AutoCutSettingsSchema.parse({ mode: 'cooking_recipe', targetDurationSeconds: 5 }));
  assert.ok(shortRecipe.hasFinalDish);
  assert.ok(shortRecipe.omittedSteps.length > 0);
  assert.ok(shortRecipe.assembledClips.some(clip => clip.cookingActivity === 'presentation'));
  assert.equal(assembleRecipe(cooking.slice(0, -1), settings).hasFinalDish, false);
  const baking = (['mixing', 'baking', 'plating'] as const).map((stage, index) => ({
    ...candidate(stage, index * 900, (index + 1) * 900), category: stage, cookingActivity: stage,
  }));
  const bakingReel = assembleRecipe(baking, AutoCutSettingsSchema.parse({ mode: 'cooking_recipe', recipeStyle: 'quick_tip', targetDurationSeconds: 15 }));
  assert.deepEqual(bakingReel.assembledClips.map(clip => clip.cookingActivity), ['mixing', 'baking', 'plating']);
  assert.equal(bakingReel.hasFinalDish, false);
  console.log('Recipe fixtures: 8/8 stages across 20 style/length combinations, 3/3 short baking stages, source order preserved.');
  const shots = buildAutoCutScenes('source', 5000, [{ timestampSec: 3, score: 0.9 }], [{ startMs: 1000, endMs: 1500 }], []);
  assert.deepEqual(shots.map(scene => [scene.startMs, scene.endMs, scene.shotType]), [
    [0, 1000, 'continuous'], [1000, 1500, 'black'], [1500, 3000, 'continuous'], [3000, 5000, 'hard_cut'],
  ]);
  assert.throws(() => validateAutoCutScenes([shots[0], { ...shots[1], startMs: 999 }], 'source', 5000), /boundaries/);
  assert.throws(() => validateAutoCutScenes([shots[0], { ...shots[1], sceneId: shots[0].sceneId }], 'source', 5000), /boundaries/);
  assert.throws(() => validateAutoCutScenes([{ ...shots[0], evidenceFrames: [1000] }], 'source', 5000), /boundaries/);
  const locked = [{ ...shots[0], locked: true }, ...shots.slice(1)];
  assert.deepEqual(reconcileAutoCutScenes(locked, []), locked);
  assert.equal(sceneCandidates(shots, []).length, 3);
  for (const mode of ['auto_highlight', 'cooking_recipe', 'fast_paced', 'tutorial', 'podcast', 'cinematic', 'custom'] as const) {
    for (const targetDurationSeconds of [5, 15, 30, 40, 45, 60, 90, 180]) {
      const result = optimizeDurationAndAssemble(pool, AutoCutSettingsSchema.parse({ mode, targetDurationSeconds, pacing: 'fast' }));
      assert.ok(result.totalDurationMs <= targetDurationSeconds * 1000);
      for (const [i, clip] of result.assembledClips.entries()) {
        const source = pool.find(c => c.id === clip.id)!;
        assert.ok(clip.startMs >= source.startMs && clip.endMs <= source.endMs);
        assert.equal(clip.durationMs, clip.endMs - clip.startMs); assert.equal(clip.speedMultiplier, 1);
        if (mode === 'fast_paced') assert.ok(clip.durationMs <= 3000);
        if (i) assert.ok(clip.startMs >= result.assembledClips[i - 1].endMs);
      }
      const timeline = autoCutClipsToTimelineClips(result.assembledClips, 'video');
      assert.equal(timeline.reduce((s, c) => s + c.durationMs, 0), result.totalDurationMs);
    }
  }
  assert.equal(JSON.stringify(pool), before, 'Never mutate source candidates');
  const recipe = pool.map((clip, index) => ({ ...clip, analysisMethod: 'semantic' as const,
    score: index < 15 ? 100 : 70 }));
  const covered = optimizeDurationAndAssemble(recipe, AutoCutSettingsSchema.parse({ targetDurationSeconds: 60 }));
  assert.equal(covered.totalDurationMs, 60000);
  assert.equal(covered.assembledClips[0].id, 'c0');
  assert.equal(covered.assembledClips.at(-1)?.id, 'c29');
  assert.ok(covered.assembledClips.some(clip => clip.startMs >= 100000 && clip.startMs < 130000));
  assert.throws(() => autoCutClipsToTimelineClips([{ ...pool[0], speedMultiplier: 1.15 }], 'video'), /original playback/);
  const dissolveSources = [{ ...candidate('outgoing', 0, 1000), transitionToNext: 'smooth' as const }, candidate('incoming', 1500, 2500)];
  const dissolve = autoCutClipsToTimelineClips(dissolveSources, 'video');
  assert.equal(dissolve[0].durationMs, 1200);
  assert.equal(dissolve[0].audioFadeOutMs, 200);
  assert.equal(dissolve[1].startMs, 1000);
  assert.equal(dissolve[1].transitionIn, 'crossfade');
  assert.equal(dissolve[1].fadeInMs, 200);
  assert.equal(dissolve[1].startMs + dissolve[1].durationMs, 2000);
  const speech = { ...dissolveSources[1], transcriptWords: [{ text: 'keep', startMs: 1550, endMs: 1650 }] };
  assert.equal(autoCutClipsToTimelineClips([dissolveSources[0], speech], 'video')[1].transitionIn, 'cut');
  console.log('PASS optimizer: all modes/durations, original bounds, no overlaps, rejection, speed, immutability');

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-autocut-'));
  const savedConfig = { storageRoot: APP_CONFIG.storageRoot, projectsDir: APP_CONFIG.projectsDir, tempDir: APP_CONFIG.tempDir };
  const keys = ['NODE_ENV', 'ALLOW_DEMO_LOGIN', 'CLOUD_PROJECT_METADATA_ENABLED', 'CLOUD_PRIVATE_MEDIA_ENABLED', 'CLOUD_MEDIA_LIFECYCLE_ENABLED', 'AI_PROVIDER', 'GEMINI_API_KEY', 'OLLAMA_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const;
  const savedEnv = new Map(keys.map(k => [k, process.env[k]]));
  Object.assign(APP_CONFIG, { storageRoot: root, projectsDir: path.join(root, 'projects'), tempDir: path.join(root, 'temp') });
  Object.assign(process.env, { NODE_ENV: 'development', ALLOW_DEMO_LOGIN: 'true', CLOUD_PROJECT_METADATA_ENABLED: 'false', CLOUD_PRIVATE_MEDIA_ENABLED: 'false', CLOUD_MEDIA_LIFECYCLE_ENABLED: 'false' });
  const request = (body: unknown, origin = 'http://localhost') => new NextRequest('http://localhost/api/clipping-studio/auto-cut', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  try {
    const directory = (await clippingProjectAccess('usr_admin', 'qa_autocut', true))!;
    const media = path.join(directory, 'media'); await fs.mkdir(media);
    const video = path.join(media, 'qa_video.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=8:size=320x240:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-c:a', 'aac', video], { windowsHide: true });
    const result = await analyzeMediaForAutoCut(video, settings);
    const duplicatesDir = path.join(directory, '.qa-duplicates');
    const exactFile = path.join(media, 'exact-copy.mp4');
    await fs.copyFile(video, exactFile);
    const resized = path.join(media, 'resized.mp4');
    const cropped = path.join(media, 'cropped.mp4');
    for (const [output, filter] of [[resized, 'scale=480:360'], [cropped, 'crop=304:228']]) {
      execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf', filter,
        '-c:v', 'libx264', '-c:a', 'copy', output], { windowsHide: true });
    }
    const fingerprint = async (id: string, file: string) => (await fingerprintDuplicateScenes(file, duplicatesDir,
      [{ ...candidate(id, 0, 3000), sourceVideoId: id }], { hasVideo: true, hasAudio: true }))[0];
    const original = await fingerprint('original', video);
    const darkBlurFile = path.join(media, 'dark-motion-blur.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf',
      'tmix=frames=5,boxblur=8:2,eq=brightness=-0.31', '-c:v', 'libx264', '-c:a', 'copy', darkBlurFile], { windowsHide: true });
    const poor = await fingerprint('dark-blur', darkBlurFile);
    const healthyScore = scoreAutoCutQuality(original, visualSettings);
    const poorScore = scoreAutoCutQuality(poor, visualSettings);
    const dimension = (result: typeof healthyScore, name: string) => result.details.find(item => item.dimension === name)!.score;
    assert.ok(dimension(healthyScore, 'sharpness') > dimension(poorScore, 'sharpness'));
    assert.ok(dimension(healthyScore, 'exposure') > dimension(poorScore, 'exposure'));
    assert.deepEqual(poor.qualityMeasurements, (await fingerprint('dark-blur', darkBlurFile)).qualityMeasurements);
    console.log('Quality calibration (original → dark motion-blur):', {
      sharpness: [dimension(healthyScore, 'sharpness'), dimension(poorScore, 'sharpness')],
      exposure: [dimension(healthyScore, 'exposure'), dimension(poorScore, 'exposure')],
    });
    for (const [file, kind] of [[exactFile, 'Exact file match'], [resized, 'Visual duplicate'], [cropped, 'Visual duplicate']]) {
      const copy = await fingerprint(path.basename(file), file);
      assert.equal(clusterDuplicates([original, copy], [], original.sourceVideoId)[0]?.alternatives[0].match.kind, kind, file);
    }
    const cameraA = path.join(media, 'camera-a.mp4'), cameraB = path.join(media, 'camera-b.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=d=4:size=160x120:r=25',
      '-f', 'lavfi', '-i', 'aevalsrc=0.3*sin(2*PI*440*t)*pow(0.6\\,mod(floor(t*20)*floor(t*20+5)\\,13)):d=4',
      '-c:v', 'libx264', '-c:a', 'aac', cameraA], { windowsHide: true });
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'smptebars=size=160x120:rate=25',
      '-i', cameraA, '-map', '0:v', '-map', '1:a', '-shortest', '-c:v', 'libx264', '-c:a', 'copy', cameraB], { windowsHide: true });
    const views = [await fingerprint('camera-a', cameraA), await fingerprint('camera-b', cameraB)];
    const angles = clusterDuplicates(views, []);
    assert.equal(angles[0]?.alternatives[0].match.kind, 'Possible simultaneous angle');
    const angleScores = views.map(view => scoreAutoCutQuality(view, visualSettings));
    assert.ok(angleScores.every(score => score.total !== undefined && score.details.some(detail => detail.dimension === 'exposure' && detail.timestamps.length === 3)));
    assert.notEqual(dimension(angleScores[0], 'exposure'), dimension(angleScores[1], 'exposure'));
    assert.ok(await fs.stat(cameraB));
    console.log('PASS duplicate fixtures: exact copy, resize, crop, distinct recipe steps, alternate take, shared-audio angles');
    assert.ok(result.totalDurationMs >= 7900 && result.totalDurationMs <= 8100);
    assert.ok(result.candidates.length > 0); assert.equal(result.cookingDetected, false); assert.equal(result.speechDetected, false, 'Tone is not claimed to be recognized speech');
    assert.ok(result.candidates.every(c => c.confidence === 0 && !c.cookingActivity));
    const silentVideo = path.join(media, 'silent.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=blue:duration=12:size=160x120:rate=25', '-c:v', 'libx264', silentVideo], { windowsHide: true });
    const noAudio = await analyzeMediaForAutoCut(silentVideo, AutoCutSettingsSchema.parse({ mode: 'cooking_recipe' }));
    assert.ok(noAudio.candidates.length > 0); assert.equal(noAudio.cookingDetected, false);
    assert.equal(buildAutoCutScenes('silent', 12000, noAudio.sceneCuts, [], noAudio.candidates).length, 1);
    const fades = path.join(media, 'fade.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      'color=white:duration=4:size=160x120:rate=24,fade=t=in:st=0.5:d=1', '-c:v', 'libx264', fades], { windowsHide: true });
    const checkpoint = new Map<number, Awaited<Parameters<NonNullable<Parameters<typeof detectVisualIntervals>[3]>['write']>[1]>>();
    const visual = await detectVisualIntervals(fades, 4000, undefined, {
      read: async offset => checkpoint.get(offset),
      write: async (offset, chunk) => { checkpoint.set(offset, chunk); },
    });
    assert.ok(visual.intervals.some(interval => interval.startMs <= 50 && interval.endMs >= 450));
    assert.ok(visual.gradual.some(cut => cut.kind === 'fade' && cut.timestampSec > 0.5 && cut.timestampSec < 1.5));
    const resumed = await detectVisualIntervals('unused-on-checkpoint-hit', 4000, undefined, {
      read: async offset => checkpoint.get(offset),
      write: async () => { throw new Error('Unexpected checkpoint rewrite'); },
    });
    assert.deepEqual(resumed, visual);
    const transitionVideo = path.join(media, 'transitions.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      'color=white:duration=2:size=160x120:rate=24[a];color=red:duration=2:size=160x120:rate=24[b];[a][b]xfade=transition=fade:duration=0.5:offset=1.25[c];color=blue:duration=1:size=160x120:rate=24[d];[c][d]concat=n=2:v=1:a=0',
      '-c:v', 'libx264', transitionVideo], { windowsHide: true });
    const transitions = await analyzeMediaForAutoCut(transitionVideo, settings);
    const transitionEvidence = await detectVisualIntervals(transitionVideo, transitions.totalDurationMs);
    assert.ok(transitions.sceneCuts.some(cut => Math.abs(cut.timestampSec - 3.25) <= 0.09), 'Find the fixture hard cut within two frames');
    assert.ok(transitionEvidence.gradual.some(cut => cut.kind === 'dissolve' && Math.abs(cut.timestampSec - 1.5) <= 0.25), `Find the fixture dissolve: ${JSON.stringify(transitionEvidence.gradual)}`);
    console.log('Scene fixture timings:', JSON.stringify({ hardCuts: transitions.sceneCuts, gradual: transitionEvidence.gradual, fade: visual.gradual, black: visual.intervals }));
    const pan = path.join(media, 'pan.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      'testsrc2=duration=6:size=320x120:rate=25', '-vf', "crop=160:120:x='20*t':y=0,select='not(mod(n,2))+not(mod(n,5))'",
      '-fps_mode', 'vfr', '-c:v', 'libx264', pan], { windowsHide: true });
    const panning = await analyzeMediaForAutoCut(pan, settings);
    assert.equal(panning.sceneCutCount, 0, 'Avoid false hard cuts on the moving VFR fixture');
    const silentAudioVideo = path.join(media, 'silent-audio.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=160x120:rate=25', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '4', '-c:v', 'libx264', '-c:a', 'aac', silentAudioVideo], { windowsHide: true });
    const silentCooking = await analyzeMediaForAutoCut(silentAudioVideo, AutoCutSettingsSchema.parse({ mode: 'cooking_recipe', silenceRemoval: 'aggressive' }));
    assert.ok(silentCooking.candidates.length > 0, 'Silent audio does not remove visual cooking footage');
    const silentVisual = await analyzeMediaForAutoCut(silentAudioVideo, AutoCutSettingsSchema.parse({ analysisMethod: 'semantic', silenceRemoval: 'aggressive' }));
    assert.ok(silentVisual.candidates.length > 0, 'Semantic visual analysis receives silent footage');
    // Exercise overlapping foreground, music-like tones and noise at the PCM level.
    const mixedAudio = execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
      'sine=f=220:r=16000:d=2[a];sine=f=440:r=16000:d=2[b];anoisesrc=r=16000:d=2:a=0.08:seed=42[c];[a][b][c]amix=inputs=3',
      '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', '-'], { windowsHide: true });
    assert.equal(measureSpeechSignal(mixedAudio), 'clear_signal', 'Mixed background energy is not digital silence');
    const pauses = path.join(media, 'pauses.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=blue:duration=6:size=160x120:rate=25', '-f', 'lavfi', '-i', "aevalsrc=if(between(t\\,2\\,4)\\,0\\,0.3*sin(2*PI*440*t)):d=6:s=44100", '-c:v', 'libx264', '-c:a', 'aac', pauses], { windowsHide: true });
    const kept = await analyzeMediaForAutoCut(pauses, AutoCutSettingsSchema.parse({ silenceRemoval: 'disabled' }));
    const removed = await analyzeMediaForAutoCut(pauses, AutoCutSettingsSchema.parse({ silenceRemoval: 'moderate' }));
    assert.ok(removed.silenceCount > 0); assert.ok(removed.candidates.reduce((s,c)=>s+c.durationMs,0) < kept.candidates.reduce((s,c)=>s+c.durationMs,0));
    const abort = new AbortController(); abort.abort();
    await assert.rejects(analyzeMediaForAutoCut(video, settings, abort.signal));
    console.log('PASS real FFmpeg media: tone, no audio, silent sections, truthful classification and cancellation');

    const body = { projectId: 'qa_autocut', filePath: video, jobId: 'qa-job', settings: { targetDurationSeconds: 30 } };
    const response = await POST(request(body)); assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json(); assert.ok(data.totalDurationMs <= 8100); assert.ok(data.analysis.candidates.length);
    assert.ok(validateAutoCutScenes(data.analysis.scenes, data.analysis.scenes[0].sourceVideoId, data.analysis.totalSourceDurationMs).length);
    const progress = await getAnalysisProgress(new NextRequest('http://localhost/api/clipping-studio/auto-cut?projectId=qa_autocut&jobId=qa-job'));
    assert.equal((await progress.json()).progress.jobId, 'qa-job');
    assert.equal((await POST(request({ ...body, settings: { targetDurationSeconds: -1 } }))).status, 400);
    assert.equal((await POST(request({ ...body, settings: { transition: 'smooth' } }))).status, 200);
    assert.equal((await POST(request({ ...body, projectId: '../escape' }))).status, 400);
    assert.equal((await POST(request({ ...body, filePath: path.join(os.tmpdir(), 'outside.mp4') }))).status, 400);
    const other = (await clippingProjectAccess('different_user', 'other_user', true))!;
    const foreign = path.join(other, 'private.mp4'); await fs.copyFile(video, foreign);
    const waveformFile = path.join(media, 'sync-source.wav');
    const pcm = Buffer.alloc(44 + signal.length * 320);
    pcm.write('RIFF'); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
    pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(8000, 24); pcm.writeUInt32LE(16000, 28);
    pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(pcm.length - 44, 40);
    for (let i = 0; i < signal.length * 160; i++) pcm.writeInt16LE(Math.round(20000 * 10 ** ((signal[Math.floor(i / 160)] + 20) / 25) * Math.sin(i * Math.PI / 10)), 44 + i * 2);
    await fs.writeFile(waveformFile, pcm);
    const syncFiles = [path.join(media, 'sync-wide.mp4'), path.join(media, 'sync-detail.mp4')];
    for (const [i, file] of syncFiles.entries()) execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', i ? 'testsrc2=size=120x160:rate=30' : 'testsrc2=size=160x120:rate=24',
      '-ss', String(i), '-i', waveformFile, '-shortest', '-c:v', 'libx264', '-c:a', 'aac', file], { windowsHide: true });
    const matched = await synchronizeCameras(request({ projectId: 'qa_autocut',
      reference: { id: 'wide', filePath: syncFiles[0], durationMs: 14000 }, cameras: [
        { id: 'detail', filePath: syncFiles[1], durationMs: 13000 }, { id: 'foreign', filePath: foreign, durationMs: 8000 },
        { id: 'missing', filePath: path.join(media, 'missing.mp4'), durationMs: 8000 },
      ] }));
    assert.equal(matched.status, 200);
    const synced = await matched.json();
    assert.ok(Math.abs(synced.sync.detail.offsetMs - 1000) <= 20);
    assert.deepEqual(synced.unavailable, ['foreign', 'missing']);
    const authorizedBRollRequest = () => request({ sources: [
      { id: 'owned', filePath: video }, { id: 'foreign', filePath: foreign }, { id: 'revoked', filePath: path.join(media, 'revocable.mp4') },
    ] });
    const revocable = path.join(media, 'revocable.mp4');
    await fs.copyFile(video, revocable);
    const checkedBRoll = await authorizeBRoll(authorizedBRollRequest());
    const checkedAssets = (await checkedBRoll.json()).assets as { id: string; url: string }[];
    assert.deepEqual(checkedAssets.map(item => item.id), ['owned', 'revoked']);
    await fs.rename(revocable, revocable + '.moved');
    assert.deepEqual((await (await authorizeBRoll(authorizedBRollRequest())).json()).assets.map((item: { id: string }) => item.id), ['owned']);
    await assert.rejects(resolveTimelineAsset('usr_admin', checkedAssets[1].url, 'http://localhost'), /unavailable/);
    assert.equal((await POST(request({ ...body, filePath: foreign }))).status, 404);
    assert.equal((await POST(request({ ...body, projectId: 'other_user', filePath: foreign }))).status, 404);
    assert.equal((await POST(request(body, 'https://evil.example'))).status, 403);
    process.env.ALLOW_DEMO_LOGIN = 'false'; assert.equal((await POST(request(body))).status, 401); process.env.ALLOW_DEMO_LOGIN = 'true';
    console.log('PASS actual route: analysis/thumbnails, invalid settings, unsupported effects, traversal, cross-account denial, auth and origin');

    // Exercise the real provider adapter and route with controlled network responses.
    // This verifies transport and validation, not recognition quality of fixture content.
    const originalFetch = globalThis.fetch;
    const aiSettings = AutoCutSettingsSchema.parse({ analysisMethod: 'semantic' });
    process.env.AI_PROVIDER = 'gemini'; process.env.GEMINI_API_KEY = 'qa-placeholder';
    let providerCalls = 0;
    let partialCalls = 0;
    let responseMode: 'valid' | 'cooking' | 'unknown-id' | 'bad-timing' | 'failure' | 'partial' = 'valid';
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        providerCalls++;
        if (responseMode === 'partial' && ++partialCalls > 1) {
          return new Response(JSON.stringify({ error: { message: 'Temporarily unavailable' } }), { status: 503 });
        }
        const body = JSON.parse(String(init?.body));
        const parts = body.contents.flatMap((content: { parts: any[] }) => content.parts);
        assert.ok(parts.some((part: any) => part.inlineData?.mimeType === 'image/jpeg' && part.inlineData.data.length > 100));
        const windows = parts.filter((part: any) => part.text?.startsWith('Window '));
        const clips = windows.map((part: any) => {
          const match = part.text.match(/Window (.*?): absolute source (\d+)–(\d+)/)!;
          return { id: responseMode === 'unknown-id' ? 'invented' : match[1], title: 'Observed fixture', reason: 'Mock response for adapter validation', visualScore: 60, speechScore: 0, confidence: 70,
            cookingActivity: responseMode === 'cooking' ? 'baking' : null,
            ...(responseMode === 'cooking' ? { recipeEvidence: {
              ingredients: [], utensils: ['baking tray'], techniques: ['baking'], footage: 'step', essential: true,
            } } : {}),
            transcript: responseMode === 'bad-timing' ? [
              { text: 'valid', startMs: Number(match[2]), endMs: Number(match[2]) + 100 },
              { text: 'invalid', startMs: Number(match[2]), endMs: Number(match[3]) + 1000 },
            ] : [] };
        });
        if (responseMode === 'failure') return new Response(JSON.stringify({ error: { message: 'Provider rejected request' } }), { status: 400 });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ clips }) }] } }] }), { status: 200 });
      }
      throw new Error('Unexpected external request in test: ' + url);
    };
    try {
      const semantic = await analyzeSemanticMoments(silentVideo, noAudio.candidates.slice(0, 2), aiSettings, { hasVideo: true, hasAudio: false });
      assert.ok(semantic.candidates.every(c => c.analysisMethod === 'semantic' && c.confidence === 70));
      responseMode = 'cooking';
      const silentRecipe = await analyzeSemanticMoments(silentVideo, noAudio.candidates.slice(0, 1),
        { ...aiSettings, mode: 'cooking_recipe' }, { hasVideo: true, hasAudio: false });
      assert.equal(silentRecipe.candidates[0].cookingActivity, 'baking');
      assert.deepEqual(silentRecipe.candidates[0].recipeEvidence?.utensils, ['baking tray']);
      assert.deepEqual(silentRecipe.candidates[0].transcriptWords, []);
      assert.ok(silentRecipe.candidates[0].evidenceFrames?.length);
      responseMode = 'unknown-id'; await assert.rejects(analyzeSemanticMoments(silentVideo, noAudio.candidates.slice(0, 2), aiSettings, { hasVideo: true, hasAudio: false }), /invalid set/);
      responseMode = 'bad-timing';
      const withSpeech = await analyzeSemanticMoments(video, result.candidates.slice(0, 2), aiSettings, { hasVideo: true, hasAudio: true });
      assert.ok(withSpeech.candidates.length > 0);
      for (const clip of withSpeech.candidates) assert.deepEqual(clip.transcriptWords?.map(word => word.text), ['valid']);
      const withoutSpeech = await analyzeSemanticMoments(silentVideo, noAudio.candidates.slice(0, 2), aiSettings, { hasVideo: true, hasAudio: false });
      assert.ok(withoutSpeech.candidates.every(clip => clip.transcriptWords?.length === 0));
      const digitalSilence = await analyzeSemanticMoments(silentAudioVideo, silentVisual.candidates.slice(0, 1), aiSettings, { hasVideo: true, hasAudio: true });
      assert.equal(digitalSilence.candidates[0].audioQuality, 'silent_signal');
      assert.deepEqual(digitalSilence.candidates[0].transcriptWords, []);
      responseMode = 'partial';
      const partialWindows = Array.from({ length: 5 }, (_, index) => ({ ...noAudio.candidates[0], id: `partial-${index}` }));
      const partial = await analyzeSemanticMoments(silentVideo, partialWindows, aiSettings, { hasVideo: true, hasAudio: false });
      assert.equal(partial.partialSpeech, true);
      assert.equal(partial.candidates.filter(clip => clip.analysisMethod === 'semantic').length, 4);
      assert.deepEqual(partial.candidates[4], partialWindows[4]);
      responseMode = 'failure'; await assert.rejects(analyzeSemanticMoments(silentVideo, noAudio.candidates.slice(0, 2), aiSettings, { hasVideo: true, hasAudio: false }), /rejected/);
      responseMode = 'valid';
      const semanticBody = { projectId: 'qa_autocut', filePath: silentVideo, settings: { analysisMethod: 'semantic' } };
      const initial = await POST(request(semanticBody)); assert.equal(initial.status, 200, await initial.clone().text());
      assert.equal((await initial.json()).analysis.method, 'multimodal-ai');
      const callsBeforeCache = providerCalls;
      assert.equal((await POST(request(semanticBody))).status, 200); assert.equal(providerCalls, callsBeforeCache, 'Reuse owned semantic cache');
      assert.equal((await POST(request({ ...semanticBody, filePath: foreign }))).status, 404); assert.equal(providerCalls, callsBeforeCache, 'Ownership is checked before inference');
      process.env.OLLAMA_API_KEY = 'qa-placeholder';
      globalThis.fetch = async (input, init) => {
        assert.equal(String(input), 'https://ollama.com/api/chat');
        const sent = JSON.parse(String(init?.body)); assert.deepEqual(sent.messages.at(-1).images, ['base64-fixture']);
        return new Response(JSON.stringify({ message: { content: '{"ok":true}' } }));
      };
      assert.equal(await generateWithOllama({ prompt: 'test', images: ['base64-fixture'] }), '{"ok":true}');
      const fallbackCalls: string[] = [];
      let geminiCalls = 0;
      globalThis.fetch = async (input, init) => {
        const body = JSON.parse(String(init?.body));
        const gemini = String(input).includes('generativelanguage.googleapis.com');
        fallbackCalls.push(gemini ? 'gemini' : body.model);
        if (gemini && ++geminiCalls === 2) return new Response(JSON.stringify({ error: { message: 'Daily quota exhausted' } }), { status: 429 });
        if (!gemini) assert.ok(body.messages.at(-1).images.length > 0);
        const prompt = gemini ? body.contents[0].parts.map((part: { text?: string }) => part.text || '').join(' ') : body.messages.at(-1).content;
        const clips = [...prompt.matchAll(/Window (\S+): absolute source/g)].map(match => ({
          id: match[1], title: gemini ? 'Gemini batch' : 'Ollama batch', reason: 'Fixture', visualScore: 60,
          speechScore: 0, confidence: 70, cookingActivity: null, transcript: [],
        }));
        const content = JSON.stringify({ clips });
        return new Response(JSON.stringify(gemini ? { candidates: [{ content: { parts: [{ text: content }] } }] } : { message: { content: content + '\nAnalysis complete.' } }));
      };
      const windows = Array.from({ length: 9 }, (_, index) => ({ ...noAudio.candidates[0], id: 'fallback_' + index }));
      const fallback = await analyzeSemanticMoments(silentVideo, windows, aiSettings, { hasVideo: true, hasAudio: false });
      assert.deepEqual(fallbackCalls, ['gemini', 'gemini', 'gemma4', 'gemma4']);
      assert.deepEqual(fallback.candidates.map(clip => clip.category), [...Array(4).fill('Gemini batch'), ...Array(5).fill('Ollama batch')]);
      assert.match(fallback.warning, /Ollama Cloud/);

      process.env.CLOUDFLARE_ACCOUNT_ID = 'qa-account'; process.env.CLOUDFLARE_API_TOKEN = 'qa-placeholder';
      const fallbackFetch = globalThis.fetch;
      let cloudflareCalls = 0;
      geminiCalls = 1;
      globalThis.fetch = async (input, init) => {
        if (String(input).includes('whisper-large-v3-turbo')) {
          cloudflareCalls++;
          return new Response('{}', { status: 401 });
        }
        return fallbackFetch(input, init);
      };
      const audioWindows = windows.map(window => ({ ...window, startMs: 0, endMs: 1000, durationMs: 1000 }));
      const visualOnly = await analyzeSemanticMoments(video, audioWindows, aiSettings, { hasVideo: true, hasAudio: true });
      assert.equal(cloudflareCalls, 1);
      assert.equal(visualOnly.candidates.length, audioWindows.length);
      assert.ok(visualOnly.candidates.every(clip => clip.transcriptWords?.length === 0));
      assert.equal(visualOnly.speechAuthorizationFailed, true);
      assert.match(visualOnly.warning, /Cloudflare rejected/);

      globalThis.fetch = async (input, init) => {
        assert.ok(String(input).includes('whisper-large-v3-turbo'));
        const sent = JSON.parse(String(init?.body)); assert.equal(sent.audio, Buffer.from('audio-fixture').toString('base64')); assert.equal(sent.vad_filter, true);
        return new Response(JSON.stringify({ success: true, result: { segments: [{ text: 'real provider segment', start: 0.1, end: 0.9 }] } }));
      };
      assert.deepEqual(await transcribeAutoCutAudio(Buffer.from('audio-fixture')), [{ text: 'real provider segment', start: 0.1, end: 0.9 }]);
    } finally { globalThis.fetch = originalFetch; }
    console.log('PASS semantic adapter: real frame inputs, provider failures, strict IDs/timing, owned cache, Ollama images, Cloudflare audio');

    const asset: MediaAsset = { id: 'media_qa', projectId: 'qa_autocut', localPath: video, filename: 'qa_video.mp4', fileSizeBytes: (await fs.stat(video)).size,
      metadata: { durationMs: 8000, durationSeconds: 8, sizeBytes: 1, formatName: 'mp4', aspectRatio: '4:3', width: 320, height: 240, fps: 25, hasAudio: true, hasVideo: true }, createdAt: new Date().toISOString() };
    const reel = createAutoCutReel(asset, [candidate('one', 1000, 2500), candidate('two', 5000, 7000)], 'Full sequence');
    const opening = suggestHooks([candidate('opening-source', 5000, 7000)], 1000, false)[0];
    const hookPlan = compileTimeline(createAutoCutReel(asset, [candidate('body', 0, 2000)], 'Hook timeline',
      { ...opening, audio: 'visual', text: 'Watch this' }));
    assert.equal(hookPlan.durationMs, 3000);
    assert.equal(hookPlan.timeline.clips.find(clip => clip.trackId === 'video' && clip.startMs === 0)?.sourceStartMs, 5000);
    assert.equal(hookPlan.timeline.clips.find(clip => clip.trackId === 'text')?.text?.value, 'Watch this');
    assert.equal(hookPlan.timeline.clips.find(clip => clip.trackId === 'audio')?.startMs, 1000);
    const secondAngle: MediaAsset = { ...asset, id: 'angle_b', filename: 'silent.mp4', localPath: silentVideo,
      metadata: { ...asset.metadata, durationMs: 12000, hasAudio: false, durationSeconds: 12 } };
    const offsets: CameraSync = { [asset.id]: { offsetMs: 0, confidence: 100, method: 'manual' },
      [secondAngle.id]: { offsetMs: 500, confidence: 95, method: 'waveform' } };
    const spoken = { ...candidate('switch-during-speech', 1000, 4000), sourceVideoId: asset.id,
      transcriptWords: [{ text: 'Keep stirring.', startMs: 1700, endMs: 2400 }] };
    const cameraCut = switchCameraRange(spoken, secondAngle, offsets, 1000);
    assert.deepEqual(cameraCut.map(clip => [clip.sourceVideoId, clip.startMs, clip.endMs]), [[asset.id, 1000, 2000], [secondAngle.id, 1500, 3500]]);
    const multicamProject = createAutoCutReel([asset, secondAngle], cameraCut, 'Multicam fixture', undefined, undefined, undefined, true,
      { masterId: asset.id, sync: offsets, transcriptClips: [spoken] });
    const multicamPlan = compileTimeline(multicamProject);
    assert.deepEqual(multicamPlan.timeline.clips.filter(clip => clip.trackId === 'audio').map(clip => [clip.sourceStartMs, clip.durationMs]), [[1000, 3000]]);
    assert.deepEqual(multicamPlan.transcript.map(word => [word.start, word.end]), [[0.7, 1.4]]);
    assert.throws(() => switchCameraRange(spoken, secondAngle, { ...offsets, [secondAngle.id]: { ...offsets[secondAngle.id], driftMs: 150 } }, 1000), /verify/);
    const slowVfr = path.join(media, 'slow-vfr.mp4');
    execFileSync(getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', pan, '-vf', 'setpts=2*PTS',
      '-fps_mode', 'vfr', '-c:v', 'libx264', slowVfr], { windowsHide: true });
    const vfrAngle: MediaAsset = { ...secondAngle, id: 'vfr', filename: 'slow-vfr.mp4', localPath: slowVfr,
      metadata: { ...secondAngle.metadata, width: 160, height: 120, fps: 12, durationMs: 12000, durationSeconds: 12 } };
    const left = { ...candidate('left-transition', 500, 2500), sourceVideoId: asset.id,
      transcriptWords: [{ text: 'First.', startMs: 800, endMs: 1400 }] };
    const right = { ...candidate('right-transition', 1000, 3000), sourceVideoId: vfrAngle.id };
    const natural = { ...defaultNaturalTransitions, profile: 'cinematic' as const,
      overrides: { [transitionKey(left, right)]: { kind: 'fade' as const, durationMs: 200 } } };
    const naturalProject = createAutoCutReel([asset, vfrAngle], [left, right], 'VFR transition', undefined, undefined, natural);
    const naturalPlan = compileTimeline(naturalProject);
    const incoming = naturalPlan.timeline.clips.find(clip => clip.assetId === 'source_vfr')!;
    assert.equal(naturalPlan.durationMs, 3800);
    assert.deepEqual([incoming.startMs, incoming.fadeInMs, incoming.sourceStartMs, incoming.naturalTransition?.kind], [1800, 200, 1000, 'fade']);
    assert.equal(naturalPlan.transcript[0].start, 0.3);
    const outgoingAudio = naturalPlan.timeline.clips.find(clip => clip.trackId === 'audio')!;
    assert.equal(audioGain(outgoingAudio, 1900), 0.5);
    const audibleRight = { ...right, sourceVideoId: asset.id, startMs: 4000, endMs: 6000,
      transcriptWords: [{ text: 'Second.', startMs: 4600, endMs: 5200 }] };
    const twoVoices = compileTimeline(createAutoCutReel(asset, [left, audibleRight], 'Audio envelopes', undefined, undefined,
      { ...natural, overrides: { [transitionKey(left, audibleRight)]: { kind: 'crossfade', durationMs: 200 } } }));
    for (const time of [1800, 1850, 1900, 1950, 1999]) assert.ok(Math.abs(twoVoices.timeline.clips.filter(clip => clip.trackId === 'audio')
      .reduce((gain, clip) => gain + audioGain(clip, time), 0) - 1) < 0.001);
    const restored = setNaturalTimelineBoundary(naturalPlan.timeline, incoming.id, 'cut', 200);
    assert.equal(restored.clips.find(clip => clip.id === incoming.id)?.startMs, 2000);
    assert.equal(restored.clips.find(clip => clip.id === outgoingAudio.id)?.audioFadeOutMs, 0);
    const bed = { ...outgoingAudio, id: 'independent-audio', linkId: undefined, durationMs: 2600 };
    assert.throws(() => setNaturalTimelineBoundary({ ...restored, clips: [...restored.clips, bed] }, incoming.id, 'fade', 200), /independently placed/);
    const blocked = (overrides: Partial<AutoCutClipCandidate>) => {
      const changed = { ...left, ...overrides };
      return compileTimeline(createAutoCutReel([asset, vfrAngle], [changed, right], 'Safe cut', undefined, undefined,
        { ...natural, overrides: { [transitionKey(changed, right)]: { kind: 'crossfade', durationMs: 200 } } }));
    };
    assert.equal(blocked({ transcriptWords: [{ text: 'Protected.', startMs: 2300, endMs: 2470 }] }).durationMs, 4000);
    assert.equal(blocked({ transitionBlack: [{ startMs: 2390, endMs: 2500 }] }).durationMs, 4000);
    assert.equal(blocked({ startMs: 2300, durationMs: 200 }).timeline.clips.find(clip => clip.assetId === 'source_vfr')?.naturalTransition?.kind, 'cut');
    const savedTransition = await saveSavedReel('usr_admin', naturalProject, 'http://localhost');
    const reloadedTransition = await getSavedReel('usr_admin', savedTransition.id);
    assert.equal(reloadedTransition?.project.timeline?.clips.find(clip => clip.id === incoming.id)?.naturalTransition?.kind, 'fade');
    assert.deepEqual(reloadedTransition?.project.timeline?.naturalTransitionSettings, { profile: 'cinematic', durationMs: 200 });
    const narration = { ...candidate('narration', 1000, 4000), sourceVideoId: asset.id, cookingActivity: 'mixing' as const,
      transcriptWords: [{ text: 'Stir the onion.', startMs: 1200, endMs: 1900 }] };
    const observed = { ...candidate('onion-detail', 2000, 5000), sourceVideoId: secondAngle.id, category: 'Onion stirring close-up',
      cookingActivity: 'mixing' as const, visionProvider: 'fixture', evidenceFrames: [2800], objects: ['onion'] };
    const libraryView = { ...secondAngle, id: 'library-angle', projectId: 'other-owned-project' };
    assert.deepEqual(suggestBRoll(narration, [{ ...observed, id: 'library', sourceVideoId: libraryView.id }, observed],
      [asset, secondAngle, libraryView], [narration], [], asset.projectId).map(item => item.source.id), [secondAngle.id, libraryView.id]);
    assert.equal(suggestBRoll({ ...narration, transcriptWords: [] }, [observed], [secondAngle], [narration], [], asset.projectId).length, 1);
    assert.equal(suggestBRoll(narration, [{ ...observed, visionProvider: undefined }], [secondAngle], [narration], [], asset.projectId).length, 0);
    assert.equal(suggestBRoll(narration, [observed], [], [narration], [], asset.projectId).length, 0);
    const brollEdit: BRollEdit = { targetId: narration.id, targetSourceId: asset.id, targetStartMs: narration.startMs,
      sourceId: secondAngle.id, startMs: 2500, durationMs: 1000, offsetMs: 500, mode: 'overlay' };
    const brollProject = (mode: BRollEdit['mode']) => createAutoCutReel([asset, secondAngle], [narration], 'B-roll fixture', undefined,
      { edits: [{ ...brollEdit, mode }], authorizedUrls: { [secondAngle.id]: '/api/files/clipping-studio/projects/qa_autocut/media/silent.mp4' } });
    const overlayPlan = compileTimeline(brollProject('overlay'));
    for (const mode of ['overlay', 'replace', 'insert'] as const) {
      const plan = compileTimeline(brollProject(mode));
      const extra = mode === 'insert' ? 1000 : 0;
      assert.equal(plan.durationMs, 3000 + extra);
      assert.equal(plan.transcript[0].start, (200 + extra) / 1000);
      const audio = plan.timeline.clips.filter(clip => clip.trackId === 'audio');
      assert.deepEqual(audio.map(clip => [clip.startMs, clip.sourceStartMs, clip.durationMs]), [[extra, 1000, 3000]]);
      assert.ok(plan.timeline.clips.some(clip => clip.assetId === 'source_angle_b' && clip.muted && clip.sourceStartMs === 2500));
      if (mode === 'replace') assert.deepEqual(plan.timeline.clips.filter(clip => clip.trackId === 'video' && clip.assetId === 'source_media_qa')
        .map(clip => [clip.startMs, clip.sourceStartMs, clip.durationMs]), [[0, 1000, 500], [1500, 2500, 1500]]);
    }
    assert.throws(() => createAutoCutReel([asset, secondAngle], [narration], 'Revoked', undefined,
      { edits: [brollEdit], authorizedUrls: {} }), /media access changed/);
    const multiAngle = createAutoCutReel([asset, secondAngle], [
      { ...candidate('second-first', 3000, 4500), sourceVideoId: secondAngle.id },
      { ...candidate('first-second', 1000, 3000), sourceVideoId: asset.id },
    ], 'Two camera sources');
    const multiPlan = compileTimeline(multiAngle);
    assert.equal(multiPlan.durationMs, 3500);
    assert.deepEqual(multiPlan.timeline.clips.filter(clip => clip.trackId === 'video').map(clip =>
      [clip.assetId, clip.startMs, clip.sourceStartMs, clip.durationMs]), [
      ['source_angle_b', 0, 3000, 1500], ['source_media_qa', 1500, 1000, 2000],
    ]);
    assert.deepEqual(validateTimeline(reel.timeline!), []);
    assert.equal(reel.timeline!.clips.filter(c => c.trackId === 'video').length, 2);
    assert.equal(reel.timeline!.clips.filter(c => c.trackId === 'audio').length, 2);
    assert.equal(reel.timeline!.clips.find(c => c.trackId === 'video' && c.startMs === 1500)?.sourceStartMs, 5000);
    assert.equal(compileTimeline(reel).durationMs, 3500);
    const withRecognizedWords = createAutoCutReel(asset, [candidate('one', 1000, 2500), { ...candidate('two', 5000, 7000), transcriptWords: [{ text: 'recognized', startMs: 5100, endMs: 5500 }] }], 'Recognized captions');
    assert.equal(withRecognizedWords.transcript[0].text, 'recognized');
    assert.equal(compileTimeline(withRecognizedWords).transcript[0].start, 1.6);
    const captionSource = { ...candidate('phrases', 1000, 3500), speechTiming: 'provider_estimate' as const, transcriptWords: [
      { text: 'अब', startMs: 1100, endMs: 1300 }, { text: 'mix करो।', startMs: 1320, endMs: 1700 },
      { text: 'Ready?', startMs: 2200, endMs: 2600 }, { text: 'Invalid', startMs: 8100, endMs: 8200 },
    ] };
    const captionPlan = compileTimeline(createAutoCutReel(asset, [captionSource], 'Auto captions'));
    assert.deepEqual(captionPlan.captionGroups.map(group => group.text), ['अब mix करो।', 'Ready?']);
    assert.equal(captionPlan.transcript[0].timingSource, 'phrase-estimated');
    const hiddenCaptions = createAutoCutReel(asset, [captionSource], 'Hidden captions', undefined, undefined, undefined, false);
    assert.equal(compileTimeline(hiddenCaptions).transcript.length, 0);
    assert.equal(hiddenCaptions.timeline?.captionSources.source_media_qa.transcript.length, 3);
    assert.equal(compileTimeline(createAutoCutReel(asset, [{ ...captionSource, audioQuality: 'silent_signal' }], 'Silence')).transcript.length, 0);
    const reorderedSpeech = createAutoCutReel(asset, [
      { ...candidate('later-first', 5000, 7000), transcriptWords: [{ text: 'अब mix करो।', startMs: 5100, endMs: 5500 }] },
      { ...candidate('earlier-second', 1000, 2500), transcriptWords: [{ text: 'Ready?', startMs: 1200, endMs: 1500 }] },
    ], 'Reordered speech');
    assert.deepEqual(compileTimeline(reorderedSpeech).transcript.map(word => [word.text, word.start, word.end]),
      [['अब mix करो।', 0.1, 0.5], ['Ready?', 2.2, 2.5]]);
    assert.equal(createAutoCutReel({ ...asset, metadata: { ...asset.metadata, hasAudio: false } }, [candidate('silent', 0, 2000)], 'Silent').timeline!.clips.length, 1);
    assert.throws(() => createAutoCutReel(asset, [candidate('invalid', 0, 9000)], 'Invalid'), /timing/);
    assert.throws(() => createAutoCutReel(asset, [], 'Empty'), /Select/);
    reel.transcript = [{ id: 'word', text: 'second clip', start: 5.1, end: 5.7 }];
    assert.ok(Math.abs(compileTimeline(reel).transcript[0].start - 1.6) < 0.001, 'Captions map source time into the second timeline clip');
    const saved = await saveSavedReel('usr_admin', reel, 'http://localhost');
    const reopened = await getSavedReel('usr_admin', saved.id);
    assert.equal(reopened?.project.timeline?.clips.length, 6);
    assert.equal(compileTimeline(reopened!.project).durationMs, 3500);
    assert.ok(await fs.stat(video), 'Original media survives saving');
    if (process.argv.includes('--render')) {
      const transitionServer = await serveTimelineAssets(new Map([['source_media_qa', video], ['source_vfr', slowVfr]]));
      try {
        for (const source of naturalPlan.timeline.assets) source.fileUrl = transitionServer.url(source.id);
        const output = path.join(root, 'natural-vfr.mp4');
        await renderRemotionReelVideo({ timelinePlan: naturalPlan, outputPath: output, groups: naturalPlan.captionGroups,
          words: naturalPlan.transcript, style: reel.captionStyle,
          outputSettings: { ...reel.outputSettings, width: 320, height: 240, fps: 30, aspectRatio: '4:3' } });
        const actual = await probeVideo(output);
        assert.ok(Math.abs(actual.duration - 3.8) <= 0.1);
        assert.equal(actual.hasAudio, true);
        const black = spawnSync(getFfmpegPath(), ['-hide_banner', '-i', output, '-vf', 'blackdetect=d=0.02:pix_th=0.1',
          '-an', '-f', 'null', '-'], { windowsHide: true, encoding: 'utf8' });
        assert.equal(black.status, 0);
        assert.doesNotMatch(black.stderr, /black_start:/);
        console.log('PASS real natural transition export: mixed resolution, VFR, 3.8 s, original audio, no detected black frames');
      } finally { await transitionServer.close(); }
      const smoothReel = createAutoCutReel(asset, [
        { ...candidate('one', 1000, 2500), transitionToNext: 'smooth' },
        candidate('two', 5000, 7000),
      ], 'Smooth sequence');
      const server = await serveTimelineAssets(new Map([[smoothReel.timeline!.assets[0].id, video]]));
      try {
        const plan = compileTimeline(smoothReel);
        assert.ok(plan.timeline.clips.some(clip => clip.trackId === 'video' && clip.transitionIn === 'crossfade'));
        plan.timeline.assets[0].fileUrl = server.url(plan.timeline.assets[0].id);
        const output = path.join(root, 'autocut-render.mp4');
        process.env.CHROME_PATH ||= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        await renderRemotionReelVideo({ timelinePlan: plan, outputPath: output, groups: plan.captionGroups, words: plan.transcript, style: reel.captionStyle,
          outputSettings: { ...reel.outputSettings, width: 320, height: 240, fps: 25, aspectRatio: '4:3' } });
        const probe = await probeVideo(output);
        assert.ok(Math.abs(probe.duration - 3.5) <= 0.1); assert.equal(probe.hasAudio, true);
        console.log('PASS real Remotion export: automatic dissolve, multi-clip duration and original audio');
        hookPlan.timeline.assets[0].fileUrl = server.url(hookPlan.timeline.assets[0].id);
        const hookOutput = path.join(root, 'hook-render.mp4');
        await renderRemotionReelVideo({ timelinePlan: hookPlan, outputPath: hookOutput, groups: hookPlan.captionGroups,
          words: hookPlan.transcript, style: reel.captionStyle,
          outputSettings: { ...reel.outputSettings, width: 320, height: 240, fps: 25, aspectRatio: '4:3' } });
        const hookProbe = await probeVideo(hookOutput);
        assert.ok(Math.abs(hookProbe.duration - 3) <= 0.1);
        assert.equal(hookProbe.hasAudio, true, 'Body audio remains present after a muted opening');
        console.log('PASS real Remotion export: 3-second reel with opening overlay and body audio');
      } finally { await server.close(); }
      const angleServer = await serveTimelineAssets(new Map([
        ['source_media_qa', video], ['source_angle_b', silentVideo],
      ]));
      try {
        for (const source of multiPlan.timeline.assets) source.fileUrl = angleServer.url(source.id);
        const output = path.join(root, 'recipe-two-sources.mp4');
        await renderRemotionReelVideo({ timelinePlan: multiPlan, outputPath: output,
          groups: multiPlan.captionGroups, words: multiPlan.transcript, style: multiAngle.captionStyle,
          outputSettings: { ...multiAngle.outputSettings, width: 320, height: 240, fps: 25, aspectRatio: '4:3' } });
        const result = await probeVideo(output);
        assert.ok(Math.abs(result.duration - 3.5) <= 0.1);
        assert.equal(result.hasAudio, true);
        console.log('PASS real recipe export: two source assets, 3.5 seconds, original audio retained');
        for (const source of overlayPlan.timeline.assets) source.fileUrl = angleServer.url(source.id);
        const brollOutput = path.join(root, 'b-roll-overlay.mp4');
        await renderRemotionReelVideo({ timelinePlan: overlayPlan, outputPath: brollOutput, groups: overlayPlan.captionGroups,
          words: overlayPlan.transcript, style: reel.captionStyle,
          outputSettings: { ...reel.outputSettings, width: 320, height: 240, fps: 25, aspectRatio: '4:3' } });
        const brollProbe = await probeVideo(brollOutput);
        assert.ok(Math.abs(brollProbe.duration - 3) <= 0.1);
        assert.equal(brollProbe.hasAudio, true);
        console.log('PASS real B-roll overlay export: two camera sources, original audio, unchanged duration');
        for (const source of multicamPlan.timeline.assets) source.fileUrl = angleServer.url(source.id);
        const cameraOutput = path.join(root, 'synchronized-cameras.mp4');
        await renderRemotionReelVideo({ timelinePlan: multicamPlan, outputPath: cameraOutput, groups: multicamPlan.captionGroups,
          words: multicamPlan.transcript, style: reel.captionStyle,
          outputSettings: { ...reel.outputSettings, width: 320, height: 240, fps: 25, aspectRatio: '4:3' } });
        const cameraProbe = await probeVideo(cameraOutput);
        assert.ok(Math.abs(cameraProbe.duration - 3) <= 0.1 && cameraProbe.hasAudio);
        const dark = spawnSync(getFfmpegPath(), ['-hide_banner', '-i', cameraOutput, '-vf', 'blackdetect=d=0.02', '-an', '-f', 'null', '-'],
          { encoding: 'utf8', windowsHide: true });
        assert.equal(dark.status, 0);
        assert.doesNotMatch(dark.stderr, /black_start:/);
        console.log('PASS synchronized camera export with one continuous master audio track');
      } finally { await angleServer.close(); }
    }
    console.log('PASS full-sequence Professional Timeline bridge: video/audio links, source offsets, silent media, duration, validation');
  } finally {
    Object.assign(APP_CONFIG, savedConfig);
    for (const [key, value] of savedEnv) { if (value === undefined) delete process.env[key]; else Object.assign(process.env, { [key]: value }); }
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
