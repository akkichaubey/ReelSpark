/**
 * Supabase Compatibility Layer (Replaced by Cloudflare D1)
 *
 * This file maintains backward compatibility for any existing references
 * while routing actual persistence to Cloudflare D1 or local storage.
 */

import { getCloudflareStatus, syncProjectToCloudflare } from './cloudflare-sync';

export interface SupabaseConfigStatus {
  configured: boolean;
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  serviceKeyConfigured: boolean;
  message: string;
}

export function getSupabaseStatus(): SupabaseConfigStatus {
  const cfStatus = getCloudflareStatus();
  return {
    configured: cfStatus.configured,
    urlConfigured: cfStatus.accountId,
    anonKeyConfigured: cfStatus.databaseId,
    serviceKeyConfigured: cfStatus.apiToken,
    message: cfStatus.configured
      ? 'Cloudflare D1 database active.'
      : 'Local persistence active (Cloudflare D1 not configured).',
  };
}

export function getBrowserSupabase(): any {
  return null;
}

export function getServerSupabase(): any {
  return null;
}

export async function syncProjectToSupabase(project: any): Promise<{ success: boolean; synced: boolean; message?: string }> {
  return syncProjectToCloudflare(project);
}
