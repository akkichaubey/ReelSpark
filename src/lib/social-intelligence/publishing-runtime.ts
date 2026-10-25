import { runtimeOrigin } from '../runtime-origin';
import { getD1Status } from '../cloudflare/d1';

/** Configuration checks only: never contact a provider or reveal credential values. */
export function publishingRuntimeStatus(requestUrl?: string) {
  const production = process.env.NODE_ENV === 'production';
  let origin: string | null = null;
  try { origin = runtimeOrigin(requestUrl); } catch { /* Report configuration below. */ }
  const key = process.env.OAUTH_ENCRYPTION_KEY?.trim();
  const authSecret = process.env.AUTH_SECRET?.trim();
  const databaseConfigured = Boolean(getD1Status().configured);
  const encryptionReady = key ? key.length >= 32 : Boolean(authSecret && authSecret.length >= 32) || (!production && !databaseConfigured);
  const privateMediaConfigured = process.env.CLOUD_PRIVATE_MEDIA_ENABLED === 'true' && databaseConfigured &&
    ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'].every(name => Boolean(process.env[name]?.trim()));
  const issues: string[] = [];
  if (!origin) issues.push('Configure AUTH_URL with the public HTTPS origin.');
  if (!encryptionReady) issues.push('Configure a stable OAUTH_ENCRYPTION_KEY of at least 32 characters; environments sharing D1 must use the same key.');
  if (production && !databaseConfigured) issues.push('Configure D1 and apply the publishing migration for durable history.');
  if (production && !privateMediaConfigured) issues.push('Configure private durable media storage before relying on uploads surviving a redeploy.');
  return { environment: production ? 'production' : 'local', origin, encryptionReady,
    databaseConfigured, privateMediaConfigured, configurationReady: issues.length === 0,
    worker: 'automatic-node-worker', verification: 'configuration-only', issues };
}
