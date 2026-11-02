/** Explicitly isolated, synthetic media for browser QA. Never run on user data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_CONFIG, getFfmpegPath } from '../src/lib/config';
import { getD1Status } from '../src/lib/cloudflare/d1';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { recordMediaOwner } from '../src/lib/media-access';
import { saveSavedReel, savedReelsCloudEnabled } from '../src/lib/saved-reels/storage';
import { timelineFromProject } from '../src/lib/timeline/model';

async function main() {
  if (!process.env.STORAGE_DIR || !path.basename(APP_CONFIG.storageRoot).startsWith('reelspark-ui-audit-') ||
    getD1Status().configured || savedReelsCloudEnabled()) {
    throw new Error('Requires a dedicated reelspark-ui-audit-* STORAGE_DIR with cloud credentials absent.');
  }
  const store = JSON.parse(await fs.readFile(path.join(APP_CONFIG.storageRoot, 'auth_store.json'), 'utf8'));
  const user = store.users.find((entry: { email: string }) => entry.email === 'ui-audit@example.test');
  if (!user) throw new Error('Create the isolated ui-audit@example.test account first.');
  const media = path.join(APP_CONFIG.storageRoot, 'caption-maker', 'asset_ui_fixture');
  await recordMediaOwner(media, user.id);
  const execute = promisify(execFile);
  await execute(getFfmpegPath(), ['-y', '-f', 'lavfi', '-i', 'color=c=0x254c73:s=360x640', '-frames:v', '1', path.join(media, 'portrait.png')]);
  await execute(getFfmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'pcm_s16le', path.join(media, 'voice.wav')]);
  const project = createEmptyCaptionProject();
  project.title = 'UI QA — synthetic three-second reel';
  project.image = { id: 'qa-image', fileName: 'portrait.png', fileUrl: '/api/files/caption-maker/asset_ui_fixture/portrait.png',
    fileSize: (await fs.stat(path.join(media, 'portrait.png'))).size, format: 'png', width: 360, height: 640, fitMode: 'contain', mediaType: 'image', duration: 3 };
  project.audio = { id: 'qa-voice', fileName: 'voice.wav', fileUrl: '/api/files/caption-maker/asset_ui_fixture/voice.wav',
    fileSize: (await fs.stat(path.join(media, 'voice.wav'))).size, format: 'wav', duration: 3, sourceType: 'audio' };
  project.transcript = [
    { id: 'qa-w1', text: 'Theme', start: 0, end: 0.8 },
    { id: 'qa-w2', text: 'preview', start: 0.8, end: 1.6 },
    { id: 'qa-w3', text: 'test', start: 1.6, end: 2.6 },
  ];
  project.captionGroups = [{ id: 'qa-g', text: 'Theme preview test', start: 0, end: 2.6, words: project.transcript }];
  project.timeline = { ...timelineFromProject(project), enabled: true };
  const reel = await saveSavedReel(user.id, project, 'http://localhost:3002');
  const manifest = { savedReel: reel.id, url: `http://localhost:3002/reel-maker?savedReel=${reel.id}`, synthetic: true };
  await fs.writeFile(path.join(APP_CONFIG.storageRoot, 'ui-fixture.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
