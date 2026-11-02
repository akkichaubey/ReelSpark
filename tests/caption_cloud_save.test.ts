import assert from 'node:assert/strict';
import { readCloudSaveResult } from '../src/lib/caption-maker/cloud-save';

async function main() {
  assert.equal(await readCloudSaveResult(Response.json({ success:true, synced:false, enabled:false, code:'CLOUD_STORAGE_DISABLED' })), 'local');
  assert.equal(await readCloudSaveResult(Response.json({ success:true, synced:true })), 'saved');
  await assert.rejects(readCloudSaveResult(Response.json({ synced:false, error:'Storage temporarily unavailable' },{status:503})), /temporarily unavailable/);
  await assert.rejects(readCloudSaveResult(Response.json({ synced:false, error:'Sign in again' },{status:401})), /Sign in again/);
  await assert.rejects(readCloudSaveResult(Response.json({ success:true, synced:false })), /Cloud save failed/);
  await assert.rejects(readCloudSaveResult(new Response('invalid JSON')), /Cloud save failed/);
  console.log('PASS: disabled cloud is local-only; confirmed sync, service/auth failures and malformed responses stay distinct.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
