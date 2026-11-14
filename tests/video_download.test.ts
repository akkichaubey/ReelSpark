import assert from 'node:assert/strict';
import { downloadFileReliably } from '../src/lib/download-client';

async function testDownloadReliability() {
  console.log('Testing video download reliability...');

  // 1. Validate function exists and handles null/empty safely
  assert.equal(typeof downloadFileReliably, 'function');
  const emptyRes = await downloadFileReliably('', 'test.mp4');
  assert.equal(emptyRes, false, 'Empty URL must safely return false');

  console.log('✓ Video download reliability tests passed');
}

testDownloadReliability();
