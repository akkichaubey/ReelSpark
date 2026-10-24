import {
  MediaServiceHealthResponse,
  MediaServiceHealthResponseSchema,
  MediaMetadata,
} from './contracts';

const STANDALONE_SERVICE_URL =
  process.env.NEXT_PUBLIC_MEDIA_SERVICE_URL || '';

export interface MediaServiceClientOptions {
  serviceUrl?: string;
  token?: string;
  timeoutMs?: number;
}

export class MediaServiceClient {
  private serviceUrl: string;
  private token?: string;
  private timeoutMs: number;

  constructor(options: MediaServiceClientOptions = {}) {
    this.serviceUrl = options.serviceUrl || STANDALONE_SERVICE_URL;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs || 4000;
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init?.headers);
      if (this.token) {
        headers.set('x-media-service-token', this.token);
      }
      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Use same-origin APIs by default; a standalone service must be explicitly configured.
   */
  async checkHealth(): Promise<MediaServiceHealthResponse & { source: 'standalone' | 'internal' }> {
    // 1. Try standalone service first
    if (this.serviceUrl) try {
      const res = await this.fetchWithTimeout(`${this.serviceUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        const parsed = MediaServiceHealthResponseSchema.safeParse(data);
        if (parsed.success) {
          return { ...parsed.data, source: 'standalone' };
        }
      }
    } catch {
      // Standalone service not reachable, fall back to internal Next.js API
    }

    // 2. Fall back to Next.js internal route
    const internalRes = await this.fetchWithTimeout('/api/clipping-studio/health');
    if (!internalRes.ok) {
      throw new Error(`Media service health check failed with status ${internalRes.status}`);
    }
    const internalData = await internalRes.json();
    return { ...MediaServiceHealthResponseSchema.parse(internalData), source: 'internal' };
  }

  /**
   * Probe Media File
   */
  async probeMedia(filePath: string): Promise<MediaMetadata> {
    // 1. Try standalone service
    if (this.serviceUrl) try {
      const res = await this.fetchWithTimeout(`${this.serviceUrl}/api/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.metadata) {
          return data.metadata;
        }
      }
    } catch {
      // Fall through to internal proxy
    }

    // 2. Fall back to internal API
    const internalRes = await this.fetchWithTimeout('/api/clipping-studio/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    const internalData = await internalRes.json();
    if (!internalRes.ok || !internalData.success || !internalData.metadata) {
      throw new Error(internalData.error || 'Failed to probe media');
    }
    return internalData.metadata;
  }
}

export const mediaServiceClient = new MediaServiceClient();
