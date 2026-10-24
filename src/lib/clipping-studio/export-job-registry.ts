// Shared by separately bundled Next route handlers in one Node process.
// This is deliberately not durable across server restarts or replicas.
export interface FallbackExportJob {
  ownerUserId?: string;
  id: string;
  projectId: string;
  jobType: string;
  targetId: string;
  status: string;
  progressPercent: number;
  outputPath: string;
  args: string[];
  totalDurationMs: number;
  sourceMappings: unknown[];
  outputSettings: unknown;
  logs: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  fileSizeBytes?: number;
  errorMessage?: string;
}

const registry = globalThis as typeof globalThis & {
  reelsparkExportJobs?: Map<string, FallbackExportJob>;
  reelsparkDaemonJobOwners?: Map<string, string>;
};
export const fallbackJobs = registry.reelsparkExportJobs ??= new Map<string, FallbackExportJob>();
export const daemonJobOwners = registry.reelsparkDaemonJobOwners ??= new Map<string, string>();
