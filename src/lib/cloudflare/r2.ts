/**
 * Cloudflare R2 Storage Client
 * Replaces local filesystem `storage/` with Cloudflare R2 (S3-compatible object store).
 *
 * Free tier: 10 GB storage, 1M Class-A ops, 10M Class-B ops per month.
 *
 * Files are accessed via:
 *   - Public R2 URL  → https://<BUCKET>.r2.dev/<key>         (if bucket is public)
 *   - Custom domain  → https://storage.yourdomain.com/<key>  (recommended)
 *   - Signed URL     → temporary expiring URL (for private assets)
 *
 * Environment variables required:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN         — needs Workers R2:Edit permission
 *   CLOUDFLARE_R2_BUCKET_NAME    — e.g. "reelspark-storage"
 *   CLOUDFLARE_R2_PUBLIC_URL     — public base URL for this bucket
 */

const CF_R2_BASE = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`;

function getR2Headers(): Record<string, string> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  return { Authorization: `Bearer ${token}` };
}

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!accountId || !bucket) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_R2_BUCKET_NAME must be set');
  }
  return { accountId, bucket, publicUrl };
}

/**
 * Upload a Buffer or ReadableStream to R2.
 * Returns the public URL of the uploaded object.
 */
export async function r2Upload(
  key: string,
  body: Buffer | Uint8Array | ReadableStream,
  contentType: string
): Promise<{ success: boolean; url: string; key: string }> {
  const { accountId, bucket, publicUrl } = getR2Config();
  const url = `${CF_R2_BASE(accountId)}/${bucket}/objects/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...getR2Headers(),
      'Content-Type': contentType,
    },
    body: body as any,
    // @ts-expect-error — duplex needed for streaming body in Node 18+
    duplex: 'half',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed (${res.status}): ${text}`);
  }

  const objectUrl = publicUrl ? `${publicUrl}/${key}` : `/api/r2/${key}`;
  return { success: true, url: objectUrl, key };
}

/**
 * Download an object from R2.
 * Returns a Response with the object body and Content-Type header.
 */
export async function r2Download(key: string): Promise<Response> {
  const { accountId, bucket } = getR2Config();
  const url = `${CF_R2_BASE(accountId)}/${bucket}/objects/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: getR2Headers(),
  });

  if (!res.ok) {
    throw new Error(`R2 download failed (${res.status}) for key: ${key}`);
  }

  return res;
}

/**
 * Delete an object from R2.
 */
export async function r2Delete(key: string): Promise<boolean> {
  const { accountId, bucket } = getR2Config();
  const url = `${CF_R2_BASE(accountId)}/${bucket}/objects/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: getR2Headers(),
  });

  return res.ok;
}

/**
 * List all objects under a prefix in R2.
 */
export async function r2List(prefix: string): Promise<{ key: string; size: number; uploaded: string }[]> {
  const { accountId, bucket } = getR2Config();
  const url = `${CF_R2_BASE(accountId)}/${bucket}/objects?prefix=${encodeURIComponent(prefix)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: getR2Headers(),
  });

  if (!res.ok) return [];

  const data = await res.json() as { result: { objects: any[] } };
  return (data.result?.objects || []).map((o: any) => ({
    key: o.key,
    size: o.size,
    uploaded: o.uploaded,
  }));
}

/**
 * Build the public URL for an R2 object key.
 */
export function r2Url(key: string): string {
  const publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');
  return publicUrl ? `${publicUrl}/${key}` : `/api/r2/${key}`;
}

/**
 * Check whether R2 credentials are configured.
 */
export function getR2Status(): {
  configured: boolean;
  message: string;
} {
  const accountId = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
  const apiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim());
  const bucket = Boolean(process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim());
  const configured = accountId && apiToken && bucket;

  return {
    configured,
    message: configured
      ? 'Cloudflare R2 is connected for media file storage.'
      : 'Cloudflare R2 not configured. Local filesystem storage is active.',
  };
}
