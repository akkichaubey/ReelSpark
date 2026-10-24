import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

function client() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!account || !accessKeyId || !secretAccessKey || !bucket) throw new Error('Private R2 credentials are incomplete');
  return {
    bucket,
    s3: new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED' }),
  };
}

/** Object keys are internal. No public URL or browser credentials are returned. */
export async function putPrivateObject(key: string, filename: string, size: number): Promise<void> {
  const { s3, bucket } = client();
  const stream = createReadStream(filename);
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: stream, ContentLength: size, ContentType: 'application/octet-stream' }), { abortSignal: AbortSignal.timeout(120000) });
  } finally { stream.destroy(); s3.destroy(); }
}

export async function getPrivateObject(key: string): Promise<Readable> {
  const { s3, bucket } = client();
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(120000) });
    if (!(object.Body instanceof Readable)) throw new Error('Invalid R2 object stream');
    object.Body.once('close', () => s3.destroy());
    return object.Body;
  } catch (error) { s3.destroy(); throw error; }
}

/** Cleanup for an upload that could not be registered in D1. */
export async function deletePrivateObject(key: string): Promise<void> {
  const { s3, bucket } = client();
  try { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(30000) }); }
  finally { s3.destroy(); }
}
