import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfigStatus {
  configured: boolean;
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  serviceKeyConfigured: boolean;
  message: string;
}

/**
 * Returns configuration status of Supabase without throwing errors.
 */
export function getSupabaseStatus(): SupabaseConfigStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = typeof window === 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;

  const urlConfigured = Boolean(url && url.trim().startsWith('http'));
  const anonKeyConfigured = Boolean(anonKey && anonKey.trim().length > 10);
  const serviceKeyConfigured = Boolean(serviceKey && serviceKey.trim().length > 10);

  const configured = urlConfigured && anonKeyConfigured;

  let message = 'Supabase PostgreSQL is connected for project metadata sync.';
  if (!configured) {
    message = 'Supabase credentials not configured. Local persistence is active on your PC.';
  }

  return {
    configured,
    urlConfigured,
    anonKeyConfigured,
    serviceKeyConfigured,
    message,
  };
}

let browserClientInstance: SupabaseClient | null = null;

/**
 * Browser-safe Supabase client (Uses anon public key only).
 * Returns null if Supabase is not configured.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (browserClientInstance) return browserClientInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || !url.startsWith('http')) {
    return null;
  }

  try {
    browserClientInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return browserClientInstance;
  } catch (err) {
    console.warn('[Supabase] Failed to initialize client:', err);
    return null;
  }
}

/**
 * Server-only Supabase client (Uses service-role key or anon key).
 * Throws only if called in client-side code to guarantee security.
 */
export function getServerSupabase(): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    throw new Error('Security violation: getServerSupabase cannot be called on the client side');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey || !url.startsWith('http')) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Synchronizes a clipping project and its child entities to Supabase when connected.
 * Fails safely without throwing if offline or unconfigured.
 */
export async function syncProjectToSupabase(project: any): Promise<{ success: boolean; synced: boolean; message?: string }> {
  const status = getSupabaseStatus();
  if (!status.configured) {
    return { success: true, synced: false, message: 'Supabase unconfigured; project preserved locally.' };
  }

  const supabase = getBrowserSupabase();
  if (!supabase) {
    return { success: true, synced: false, message: 'Supabase client unavailable; project preserved locally.' };
  }

  try {
    // 1. Upsert project
    const { error: projErr } = await supabase.from('clipping_projects').upsert({
      id: project.id,
      name: project.name,
      description: project.description,
      settings: {},
      updated_at: new Date().toISOString(),
    });
    if (projErr) throw projErr;

    // 2. Upsert media assets
    if (project.mediaAssets?.length > 0) {
      const payload = project.mediaAssets.map((a: any) => ({
        id: a.id,
        project_id: project.id,
        filename: a.filename,
        local_path: a.localPath,
        file_size_bytes: a.fileSizeBytes,
        metadata: a.metadata,
      }));
      await supabase.from('media_assets').upsert(payload);
    }

    // 3. Upsert clips
    if (project.clips?.length > 0) {
      const payload = project.clips.map((c: any) => ({
        id: c.id,
        project_id: project.id,
        media_asset_id: c.mediaAssetId,
        name: c.name,
        start_ms: c.startMs,
        end_ms: c.endMs,
        duration_ms: c.durationMs,
        order_index: c.orderIndex,
        notes: c.notes,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('clips').upsert(payload);
    }

    return { success: true, synced: true, message: 'Synchronized to Supabase PostgreSQL' };
  } catch (err: any) {
    return { success: false, synced: false, message: err.message || 'Supabase sync failed; preserved locally' };
  }
}
