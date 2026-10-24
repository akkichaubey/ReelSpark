// Reports booleans only. Never print environment values or API tokens.
require('./check-node.cjs');
require('@next/env').loadEnvConfig(process.cwd());
const has = key => Boolean(process.env[key]?.trim() && !process.env[key].startsWith('your-'));
let httpsOrigin = false;
try { httpsOrigin = new URL(process.env.AUTH_URL).protocol === 'https:'; } catch {}
const checks = {
  nodeSecurityBaseline: true,
  productionHttpsOrigin: httpsOrigin,
  googleCredentials: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET'),
  d1Credentials: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'].every(has),
  privateR2Credentials: ['CLOUDFLARE_R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].every(has),
  metadataEnabled: process.env.CLOUD_PROJECT_METADATA_ENABLED === 'true',
  privateMediaEnabled: process.env.CLOUD_PRIVATE_MEDIA_ENABLED === 'true',
  lifecycleEnabled: process.env.CLOUD_MEDIA_LIFECYCLE_ENABLED === 'true',
  demoDisabled: process.env.ALLOW_DEMO_LOGIN !== 'true',
};
console.log(JSON.stringify({ configurationChecks: checks, note: 'Configuration only: migrations, Linux execution and live cloud recovery require separate verification.' }, null, 2));
if (Object.values(checks).some(value => !value)) process.exitCode = 1;
