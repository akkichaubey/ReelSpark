type ApiErrorBody = {
  error?: string;
  message?: string;
};

function responseError(status: number, body: string, parseError = false): Error {
  if (status === 413) {
    return new Error('This file is larger than the server accepts. Try a smaller file.');
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return new Error(
      `The server returned an empty response (HTTP ${status || 'unknown'}). It may have stopped while receiving or processing this file. Please retry; if it repeats, check the server logs.`
    );
  }

  if (parseError) {
    return new Error(
      `The server returned an unreadable response (HTTP ${status || 'unknown'}). Please retry; if it repeats, check the server logs.`
    );
  }

  try {
    const parsed = JSON.parse(trimmedBody) as ApiErrorBody;
    if (parsed.error || parsed.message) return new Error(parsed.error || parsed.message);
  } catch {
    // Fall through to the status-based message for HTML/proxy error pages.
  }

  return new Error(`The upload failed (HTTP ${status || 'unknown'}). Please retry.`);
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) throw responseError(response.status, body);

  let parsed: T;
  try {
    parsed = JSON.parse(body) as T;
  } catch {
    throw responseError(response.status, body, true);
  }

  if (!response.ok) {
    throw responseError(response.status, body);
  }
  return parsed;
}

export type UploadMediaType = 'image' | 'video' | 'audio';

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'UploadCancelledError';
  }
}

function notifyServerUploadCancellation(uploadId: string): void {
  void fetch(`/api/storage/uploads/${encodeURIComponent(uploadId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => undefined);
}

function newUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

/** Read a local image file with measurable progress and an optional cancel signal. */
export function readFileAsDataUrlWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const reader = new FileReader();
    const cleanupAbortListener = () => signal?.removeEventListener('abort', abortRead);
    const abortRead = () => reader.abort();

    reader.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.round(Math.max(0, Math.min(1, event.loaded / event.total)) * 100));
    });
    reader.addEventListener('load', () => {
      cleanupAbortListener();
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected image could not be read. Please choose it again.'));
        return;
      }
      onProgress(100);
      resolve(reader.result);
    });
    reader.addEventListener('error', () => {
      cleanupAbortListener();
      reject(new Error('The selected image could not be read. Please choose it again.'));
    });
    reader.addEventListener('abort', () => {
      cleanupAbortListener();
      reject(new UploadCancelledError());
    });

    signal?.addEventListener('abort', abortRead, { once: true });
    if (signal?.aborted) {
      cleanupAbortListener();
      reject(new UploadCancelledError());
    } else {
      reader.readAsDataURL(file);
    }
  });
}

/** Read a local text file with measurable progress and an optional cancel signal. */
export function readFileAsTextWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const reader = new FileReader();
    const cleanupAbortListener = () => signal?.removeEventListener('abort', abortRead);
    const abortRead = () => reader.abort();

    reader.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const percent = Math.round(Math.max(0, Math.min(1, event.loaded / event.total)) * 100);
      onProgress(Math.min(99, percent));
    });
    reader.addEventListener('load', () => {
      cleanupAbortListener();
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected project file could not be read. Please choose it again.'));
        return;
      }
      onProgress(100);
      resolve(reader.result);
    });
    reader.addEventListener('error', () => {
      cleanupAbortListener();
      reject(new Error('The selected project file could not be read. Please choose it again.'));
    });
    reader.addEventListener('abort', () => {
      cleanupAbortListener();
      reject(new UploadCancelledError());
    });

    signal?.addEventListener('abort', abortRead, { once: true });
    if (signal?.aborted) {
      cleanupAbortListener();
      reject(new UploadCancelledError());
    } else {
      reader.readAsText(file);
    }
  });
}

/** Upload a File as a raw request stream so the server never buffers a multipart copy. */
export function uploadFileWithProgress<T>(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  mediaType?: UploadMediaType,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const request = new XMLHttpRequest();
    const uploadId = newUploadId();
    let cancellationNotified = false;
    const notifyCancellation = () => {
      if (cancellationNotified) return;
      cancellationNotified = true;
      notifyServerUploadCancellation(uploadId);
    };
    const cleanupAbortListener = () => signal?.removeEventListener('abort', abortRequest);
    const abortRequest = () => { request.abort(); notifyCancellation(); };
    request.open('POST', url);
    request.responseType = 'text';
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.setRequestHeader('X-ReelSpark-File-Name', encodeURIComponent(file.name));
    request.setRequestHeader('X-ReelSpark-Upload-Id', uploadId);
    if (mediaType) request.setRequestHeader('X-ReelSpark-Media-Type', mediaType);

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const fraction = Math.max(0, Math.min(1, event.loaded / event.total));
      onProgress(Math.round(fraction * 100));
    });

    request.addEventListener('load', () => {
      cleanupAbortListener();
      const body = request.responseText || '';
      if (!body.trim()) {
        reject(responseError(request.status, body));
        return;
      }

      let parsed: T;
      try {
        parsed = JSON.parse(body) as T;
      } catch {
        reject(responseError(request.status, body, true));
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(responseError(request.status, body));
        return;
      }

      resolve(parsed);
    });

    request.addEventListener('error', () => {
      cleanupAbortListener();
      notifyCancellation();
      reject(new Error('Network connection ended before the upload finished. Check your connection and try again.'));
    });
    request.addEventListener('abort', () => {
      cleanupAbortListener();
      notifyCancellation();
      reject(new UploadCancelledError());
    });
    signal?.addEventListener('abort', abortRequest, { once: true });
    if (signal?.aborted) {
      cleanupAbortListener();
      reject(new UploadCancelledError());
    } else {
      request.send(file);
    }
  });
}

/** Uploads a FormData body while reporting real network-transfer progress. */
export function uploadFormDataWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const request = new XMLHttpRequest();
    const cleanupAbortListener = () => signal?.removeEventListener('abort', abortRequest);
    const abortRequest = () => request.abort();
    request.open('POST', url);
    request.responseType = 'text';

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const fraction = Math.max(0, Math.min(1, event.loaded / event.total));
      onProgress(Math.round(fraction * 100));
    });

    request.addEventListener('load', () => {
      cleanupAbortListener();
      const body = request.responseText || '';
      if (!body.trim()) {
        reject(responseError(request.status, body));
        return;
      }

      let parsed: T;
      try {
        parsed = JSON.parse(body) as T;
      } catch {
        reject(responseError(request.status, body, true));
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(responseError(request.status, body));
        return;
      }

      resolve(parsed);
    });

    request.addEventListener('error', () => {
      cleanupAbortListener();
      reject(new Error('Network connection ended before the upload finished. Check your connection and try again.'));
    });
    request.addEventListener('abort', () => {
      cleanupAbortListener();
      reject(new UploadCancelledError());
    });
    signal?.addEventListener('abort', abortRequest, { once: true });
    if (signal?.aborted) {
      cleanupAbortListener();
      reject(new UploadCancelledError());
    } else {
      request.send(formData);
    }
  });
}
