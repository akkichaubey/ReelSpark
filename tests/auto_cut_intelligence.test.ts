import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
import type { CookingActivity } from '../src/lib/auto-cut/types';
import { saveSavedReel, getSavedReel } from '../src/lib/saved-reels/storage';
import { serveTimelineAssets } from '../src/lib/timeline/render-assets';
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
    let responseMode: 'valid' | 'cooking' | 'unknown-id' | 'bad-timing' | 'failure' = 'valid';
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com')) {
        providerCalls++;
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
    const secondAngle: MediaAsset = { ...asset, id: 'angle_b', filename: 'silent.mp4', localPath: silentVideo,
      metadata: { ...asset.metadata, durationMs: 12000, hasAudio: false, durationSeconds: 12 } };
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
