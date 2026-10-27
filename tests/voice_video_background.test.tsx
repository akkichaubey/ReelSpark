import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { APP_CONFIG, getFfmpegPath } from '../src/lib/config';
import { POST } from '../src/app/api/caption-maker/upload/route';
import { canReadMedia } from '../src/lib/media-access';
import { voiceVideoBackgroundUpdates } from '../src/lib/caption-maker/voice-video-background';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { AssetUploadSection } from '../src/components/caption-maker/AssetUploadSection';
import { BackgroundLayer } from '../src/remotion/BackgroundLayer';
import { CaptionReel } from '../src/remotion/CaptionReel';
import { OffthreadVideo } from 'remotion';
import type { AudioAsset, ImageAsset } from '../src/lib/caption-maker/types';

async function main() {
  const video: ImageAsset = { id: 'source', fileName: 'speech.mp4', fileUrl: '/api/files/caption-maker/source/speech.mp4', storagePath: '/owned/speech.mp4', fileSize: 1000, width: 640, height: 360, format: 'MP4', mediaType: 'video', duration: 2, fitMode: 'cover' };
  const audio: AudioAsset = { id: 'voice', fileName: 'speech.mp4 (Audio)', fileUrl: '/api/files/caption-maker/source/voice.mp3', duration: 2, fileSize: 100, format: 'MP3', sourceType: 'video', sourceVideo: video };
  const project = createEmptyCaptionProject('choice-test');
  project.image = { ...video, id: 'old', fileName: 'existing.png', mediaType: 'image', format: 'PNG' };
  project.mediaAssets = [project.image];
  const snapshot = structuredClone(project);
  const nodes = (node: React.ReactNode): React.ReactElement<Record<string, any>>[] => {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!React.isValidElement<Record<string, any>>(node)) return [];
    return [node, ...nodes(node.props.children)];
  };
  for (const fitMode of ['cover', 'contain', 'blur'] as const) {
    const backgrounds = nodes(await BackgroundLayer({ imageSrc: video.fileUrl, mediaType: 'video', fitMode, muted: true })).filter(node => node.type === OffthreadVideo);
    assert.equal(backgrounds.length, fitMode === 'blur' ? 2 : 1);
    assert.ok(backgrounds.every(node => node.props.muted === true), 'Reused video cannot duplicate the extracted spoken track');
  }
  const composition = await CaptionReel({ imageSrc: video.fileUrl, mediaType: 'video', backgroundVideoMuted: true, audioSrc: audio.fileUrl, durationInSeconds: 2, transcript: [], captionGroups: [], captionStyle: project.captionStyle, outputSettings: project.outputSettings });
  assert.equal(nodes(composition as React.ReactNode).find(node => node.type === BackgroundLayer)?.props.muted, true);
  assert.equal(nodes(await BackgroundLayer({ imageSrc: video.fileUrl, mediaType: 'video' })).find(node => node.type === OffthreadVideo)?.props.muted, false, 'Existing background-video behavior remains the default');
  assert.deepEqual(voiceVideoBackgroundUpdates(project, audio), {}, 'Video upload must not automatically replace the background');
  const chosen = voiceVideoBackgroundUpdates(project, audio, true);
  assert.equal(chosen.image?.fileUrl, video.fileUrl);
  assert.equal(chosen.image?.muteSourceAudio, true, 'Visual source stays muted even if the spoken track is later replaced');
  assert.equal(chosen.mediaAssets?.length, 2, 'Retain existing library media');
  assert.deepEqual(project, snapshot, 'Choice must not mutate previous project/history');
  assert.equal(voiceVideoBackgroundUpdates({ ...project, ...chosen }, audio, true).mediaAssets?.length, 2, 'Repeated choice does not duplicate media');
  const audioOnly = { ...audio, sourceType: 'audio' as const, sourceVideo: undefined };
  assert.deepEqual(voiceVideoBackgroundUpdates(project, audioOnly, true), {});
  assert.deepEqual(voiceVideoBackgroundUpdates(project, { ...audio, sourceVideo: undefined }, true), {}, 'Legacy uploads with no retained video remain valid');
  const ui = (voice?: AudioAsset) => renderToStaticMarkup(<AssetUploadSection audio={voice} onImageChange={() => {}} onAudioChange={() => {}} onTranscribe={() => {}} isTranscribing={false} onFitModeChange={() => {}} />);
  assert.match(ui(audio), /Use this video as background/);
  assert.doesNotMatch(ui(audioOnly), /Use this video as background/);
  assert.doesNotMatch(ui(undefined), /Use this video as background/);
  const using = renderToStaticMarkup(<AssetUploadSection image={video} audio={audio} onImageChange={() => {}} onAudioChange={() => {}} onTranscribe={() => {}} isTranscribing={false} onFitModeChange={() => {}} />);
  assert.match(using, /Using voice video as background/);
  console.log('PASS: video-only option, explicit choice, existing media/history preservation, idempotency and legacy/audio-only compatibility');

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reelspark-voice-video-'));
  const oldRoot = APP_CONFIG.storageRoot;
  const keys = ['ALLOW_DEMO_LOGIN', 'CLOUD_PRIVATE_MEDIA_ENABLED'] as const;
  const oldEnv = new Map(keys.map(key => [key, process.env[key]]));
  APP_CONFIG.storageRoot = root;
  process.env.ALLOW_DEMO_LOGIN = 'true';
  process.env.CLOUD_PRIVATE_MEDIA_ENABLED = 'false';
  try {
    const source = path.join(root, 'fixture.mp4');
    execFileSync(getFfmpegPath(), ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:size=320x240:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', source], { windowsHide: true });
    const bytes = await fs.readFile(source);
    const request = (name: string, body: Buffer, type = 'audio') => new NextRequest('http://localhost/api/caption-maker/upload', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/octet-stream', 'content-length': String(body.length), 'x-reelspark-file-name': encodeURIComponent(name), 'x-reelspark-media-type': type }, body: new Uint8Array(body) });
    const uploaded = await POST(request('voice.mp4', bytes));
    assert.equal(uploaded.status, 200, await uploaded.clone().text());
    const data = await uploaded.json();
    assert.equal(data.asset.sourceType, 'video');
    assert.equal(data.asset.format, 'MP3');
    assert.equal(data.asset.sourceVideo.mediaType, 'video');
    assert.equal(data.asset.sourceVideo.muteSourceAudio, true);
    assert.equal(data.asset.sourceVideo.width, 320);
    assert.equal(data.asset.sourceVideo.height, 240);
    assert.notEqual(data.asset.fileUrl, data.asset.sourceVideo.fileUrl, 'Separate voice and muted visual sources');
    await fs.access(data.asset.storagePath);
    await fs.access(data.asset.sourceVideo.storagePath);
    assert.equal(await canReadMedia('usr_admin', data.asset.sourceVideo.storagePath), true);
    assert.equal(await canReadMedia('someone_else', data.asset.sourceVideo.storagePath), false);
    const mp3 = await fs.readFile(data.asset.storagePath);
    const audioResponse = await (await POST(request('voice.mp3', mp3))).json();
    assert.equal(audioResponse.asset.sourceVideo, undefined, 'Audio-only upload must not offer background visuals');
    const backgroundResponse = await (await POST(request('background.mp4', bytes, 'video'))).json();
    assert.equal(backgroundResponse.type, 'video', 'Existing background upload flow stays available');
    assert.equal(backgroundResponse.audioAsset, undefined);
    console.log('PASS: actual video upload retains original visuals and extracted MP3, measured dimensions, ownership checks, audio-only and existing background uploads');
  } finally {
    APP_CONFIG.storageRoot = oldRoot;
    for (const [key, value] of oldEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
