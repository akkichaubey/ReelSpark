// Uses the current Node executable. Does not load .env.local or touch live cloud resources.
const { spawnSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const suites = [
  'google_auth.test.ts', 'social_post_platform_rules.test.ts',
  'server_media_client.test.ts', 'project_access.test.ts', 'media_access.test.ts',
  'clipping_media_security.test.ts', 'export_fallback_routes.test.ts',
  'settings_account_cache.test.ts', 'cloud_project_documents.test.ts',
  'private_media_cloud.test.ts', 'media_lifecycle.test.ts', 'storage_references.test.ts',
  'server_export_plan.test.ts', 'transcription_truthfulness.test.ts', 'gemini_retry.test.ts',
  'reels_cta_presets.test.ts', 'smart_social_intelligence.test.ts',
  'social_publishing_stage1.test.ts', 'social_publishing_pipeline.test.ts', 'social_publishing_security.test.ts',
  'runtime_environment.test.ts',
];
for (const suite of suites) {
  const args = ['node_modules/tsx/dist/cli.mjs', `tests/${suite}`];
  if (suite === 'server_export_plan.test.ts' && process.argv.includes('--real')) args.push('--real');
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true,
    env: { ...process.env, STORAGE_DIR: mkdtempSync(join(tmpdir(), 'reelspark-verify-')), NODE_ENV: 'test', CLOUD_PROJECT_METADATA_ENABLED: 'false', CLOUD_PRIVATE_MEDIA_ENABLED: 'false', CLOUD_MEDIA_LIFECYCLE_ENABLED: 'false' } });
  if (result.error || result.status !== 0) {
    console.error(`FAIL: ${suite}`, result.error?.message || `exit ${result.status}`);
    process.exit(1);
  }
}
console.log(`PASS: ${suites.length} server regression suites on ${process.version}`);
