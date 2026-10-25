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

/** Upload a File as a raw request stream so the server never buffers a multipart copy. */
export function uploadFileWithProgress<T>(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  mediaType?: UploadMediaType,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.responseType = 'text';
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.setRequestHeader('X-ReelSpark-File-Name', encodeURIComponent(file.name));
    if (mediaType) request.setRequestHeader('X-ReelSpark-Media-Type', mediaType);

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const fraction = Math.max(0, Math.min(1, event.loaded / event.total));
      onProgress(Math.round(fraction * 100));
    });

    request.addEventListener('load', () => {
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
      reject(new Error('Network connection ended before the upload finished. Check your connection and try again.'));
    });
    request.addEventListener('abort', () => reject(new Error('The upload was cancelled.')));
    request.send(file);
  });
}

/** Uploads a FormData body while reporting real network-transfer progress. */
export function uploadFormDataWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.responseType = 'text';

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const fraction = Math.max(0, Math.min(1, event.loaded / event.total));
      onProgress(Math.round(fraction * 100));
    });

    request.addEventListener('load', () => {
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
      reject(new Error('Network connection ended before the upload finished. Check your connection and try again.'));
    });
    request.addEventListener('abort', () => reject(new Error('The upload was cancelled.')));
    request.send(formData);
  });
}
