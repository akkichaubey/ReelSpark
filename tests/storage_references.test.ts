import assert from 'node:assert/strict';
import path from 'node:path';
import { toStorageReference, fromStorageReference } from '../src/lib/cloudflare/storage-references';

const oldRoot = path.resolve('fixture-old', 'storage');
const newRoot = path.resolve('fixture-new', 'storage');
const source = path.join(oldRoot, 'clipping-studio', 'projects', 'project', 'media', 'video.mp4');
const portable = toStorageReference(source, oldRoot);
assert.equal(portable, 'reelspark-storage:clipping-studio/projects/project/media/video.mp4');
assert.equal(fromStorageReference(portable, newRoot), path.join(newRoot, 'clipping-studio', 'projects', 'project', 'media', 'video.mp4'));
assert.equal(fromStorageReference('D:\\old\\storage\\caption-maker\\asset_one\\audio.mp3', newRoot), path.join(newRoot, 'caption-maker', 'asset_one', 'audio.mp3'));
for (const relative of ['../escape.mp4', 'caption-maker/../escape.mp4', 'caption-maker/C:/escape.mp4', '/caption-maker/asset/video.mp4']) {
  assert.throws(() => fromStorageReference(`reelspark-storage:${relative}`, newRoot));
}
assert.throws(() => toStorageReference(path.join(oldRoot, '..', 'outside.mp4'), oldRoot));
console.log('PASS: portable media paths, changed storage root, Windows legacy rebinding and traversal rejection');
