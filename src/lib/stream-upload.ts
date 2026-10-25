import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_UPLOAD_BYTES } from './media-validation';

export class UploadRequestError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = 'UploadRequestError';
  }
}

export interface IncomingUploadMetadata {
  filename: string;
  mediaType?: 'image' | 'video' | 'audio';
  expectedSize?: number;
  uploadId: string;
}

export function getIncomingUploadId(request: Request): string {
  const header = request.headers.get('x-reelspark-upload-id');
  if (!header) return randomUUID();
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(header)) throw new UploadRequestError('The upload session is invalid. Refresh the page and try again.');
  return header;
}

/** Read upload metadata from headers so the media bytes can remain a stream. */
export function getIncomingUploadMetadata(request: Request, requireMediaType = false): IncomingUploadMetadata {
  const contentType = request.headers.get('content-type')?.toLowerCase() || '';
  if (contentType.includes('multipart/form-data')) {
    throw new UploadRequestError('This page is using an older upload format. Refresh the page and upload again.', 415);
  }

  const encodedFilename = request.headers.get('x-reelspark-file-name');
  if (!encodedFilename) throw new UploadRequestError('The upload is missing its file name. Refresh the page and try again.');

  let filename: string;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    throw new UploadRequestError('The uploaded file name is invalid.');
  }
  if (!filename.trim() || filename.length > 255 || filename.includes('\0')) {
    throw new UploadRequestError('The uploaded file name is invalid.');
  }

  const rawMediaType = request.headers.get('x-reelspark-media-type');
  if (requireMediaType && rawMediaType !== 'image' && rawMediaType !== 'video' && rawMediaType !== 'audio') {
    throw new UploadRequestError('Choose whether this upload is an image, video, or audio file.');
  }

  const rawLength = request.headers.get('content-length');
  let expectedSize: number | undefined;
  if (rawLength !== null) {
    if (!/^\d+$/.test(rawLength)) throw new UploadRequestError('The upload size is invalid.');
    expectedSize = Number(rawLength);
    if (!Number.isSafeInteger(expectedSize)) throw new UploadRequestError('The upload size is invalid.');
    if (expectedSize === 0) throw new UploadRequestError('The uploaded file is empty.');
    if (expectedSize > MAX_UPLOAD_BYTES) {
      throw new UploadRequestError(`Files larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB are not supported.`, 413);
    }
  }

  return {
    filename,
    uploadId: getIncomingUploadId(request),
    mediaType: rawMediaType === 'image' || rawMediaType === 'video' || rawMediaType === 'audio' ? rawMediaType : undefined,
    expectedSize,
  };
}

/** Stream an incoming raw file body to disk without buffering the full upload in memory. */
export async function streamRequestBodyToFile(
  request: Request,
  targetPath: string,
  maxBytes = MAX_UPLOAD_BYTES,
  signal?: AbortSignal,
): Promise<number> {
  if (!request.body) throw new UploadRequestError('The upload did not contain a file body.');

  const rawLength = request.headers.get('content-length');
  const expectedSize = rawLength === null ? undefined : Number(rawLength);
  if (expectedSize !== undefined && expectedSize > maxBytes) {
    throw new UploadRequestError(`Files larger than ${Math.round(maxBytes / 1024 / 1024)} MB are not supported.`, 413);
  }

  let size = 0;
  const sizeLimit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(new UploadRequestError(`Files larger than ${Math.round(maxBytes / 1024 / 1024)} MB are not supported.`, 413));
        return;
      }
      callback(null, chunk);
    },
  });

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const output = await fs.promises.open(targetPath, 'wx');
  try {
    if (signal) {
      await pipeline(Readable.fromWeb(request.body as any), sizeLimit, output.createWriteStream(), { signal });
    } else {
      await pipeline(Readable.fromWeb(request.body as any), sizeLimit, output.createWriteStream());
    }
  } catch (error) {
    await fs.promises.rm(targetPath, { force: true }).catch(() => undefined);
    throw error;
  }

  if (size === 0) {
    await fs.promises.rm(targetPath, { force: true });
    throw new UploadRequestError('The uploaded file is empty.');
  }
  if (expectedSize !== undefined && size !== expectedSize) {
    await fs.promises.rm(targetPath, { force: true });
    throw new UploadRequestError('The upload ended before the complete file arrived.');
  }

  return size;
}
