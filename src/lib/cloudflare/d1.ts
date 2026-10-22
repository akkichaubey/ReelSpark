/**
 * Cloudflare D1 Database Client
 * Replaces Supabase PostgreSQL with Cloudflare's edge-native SQLite (D1).
 *
 * D1 is accessed via the Cloudflare Workers Bindings API (env.DB) in
 * Cloudflare Pages Functions/Workers, or via the D1 HTTP REST API when
 * running in a local Next.js dev server or Render.com media service.
 *
 * Environment variables required:
 *   CLOUDFLARE_ACCOUNT_ID   — your CF account ID
 *   CLOUDFLARE_D1_DATABASE_ID — the database UUID from wrangler.toml
 *   CLOUDFLARE_API_TOKEN    — API token with D1:Edit permission
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: {
    changed_db: boolean;
    changes: number;
    duration: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
}

export interface D1ExecResult {
  success: boolean;
  error?: string;
}

// ─── HTTP REST client (used outside Cloudflare edge, e.g. Render.com) ─────────

const CF_BASE = 'https://api.cloudflare.com/client/v4';

function getD1Headers(): Record<string, string> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function getD1BaseUrl(): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const dbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  if (!accountId || !dbId) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_DATABASE_ID must be set');
  }
  return `${CF_BASE}/accounts/${accountId}/d1/database/${dbId}`;
}

/**
 * Execute a SQL query against Cloudflare D1 via REST API.
 * Use this when running outside Cloudflare Workers (e.g. local dev, Render.com).
 */
export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | boolean | null)[] = []
): Promise<D1Result<T>> {
  const baseUrl = getD1BaseUrl();
  const res = await fetch(`${baseUrl}/query`, {
    method: 'POST',
    headers: getD1Headers(),
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { result: D1Result<T>[]; success: boolean; errors: any[] };
  if (!data.success || data.errors?.length > 0) {
    throw new Error(`D1 error: ${JSON.stringify(data.errors)}`);
  }

  return data.result?.[0] ?? { results: [], success: true };
}

/**
 * Execute a raw SQL statement (CREATE, INSERT, UPDATE, DELETE) via REST API.
 */
export async function d1Exec(sql: string): Promise<D1ExecResult> {
  const baseUrl = getD1BaseUrl();
  const res = await fetch(`${baseUrl}/raw`, {
    method: 'POST',
    headers: getD1Headers(),
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `D1 exec failed (${res.status}): ${text}` };
  }

  return { success: true };
}

/**
 * Check whether D1 credentials are configured.
 */
export function getD1Status(): {
  configured: boolean;
  accountId: boolean;
  databaseId: boolean;
  apiToken: boolean;
  message: string;
} {
  const accountId = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
  const databaseId = Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID?.trim());
  const apiToken = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim());
  const configured = accountId && databaseId && apiToken;

  return {
    configured,
    accountId,
    databaseId,
    apiToken,
    message: configured
      ? 'Cloudflare D1 is connected for project metadata sync.'
      : 'Cloudflare D1 credentials not configured. Local-only mode is active.',
  };
}
