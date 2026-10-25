import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { commitStorageFile, createStorageStagingPath, removeStorageFile } from '../storage-files';

export * from './export-planner';

// Binary resolution
export function getFfmpegBinary(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const localBin = path.join(
    process.cwd(),
    'bin',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );
  if (fs.existsSync(localBin)) return localBin;
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

/**
 * Returns safe output directory, falling back to storage/clipping-studio/projects/[id]/exports
 */
export function resolveOutputDirectory(projectId: string, customDir?: string): string {
  let targetDir = customDir;
  if (!targetDir || !path.isAbsolute(targetDir)) {
    targetDir = path.join(process.cwd(), 'storage', 'clipping-studio', 'projects', projectId, 'exports');
  }
  if (!fs.existsSync(/*turbopackIgnore: true*/ targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

/**
 * Ensures unique filename by appending _1, _2 if file already exists
 */
export function getCollisionSafeFilename(dir: string, baseName: string, ext: string): { fullPath: string; fileName: string } {
  const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
  let fileName = `${baseName}${cleanExt}`;
  let fullPath = path.join(dir, fileName);
  let counter = 1;

  while (fs.existsSync(/*turbopackIgnore: true*/ fullPath)) {
    fileName = `${baseName}_${counter}${cleanExt}`;
    fullPath = path.join(dir, fileName);
    counter++;
  }

  return { fullPath, fileName };
}

export interface RunningProcessHandle {
  process: ChildProcess;
  cancel: () => void;
}

// Active background execution map
const processRegistry = globalThis as typeof globalThis & {
  reelsparkExportProcesses?: Map<string, RunningProcessHandle>;
};
const activeProcessMap = processRegistry.reelsparkExportProcesses ??= new Map<string, RunningProcessHandle>();

export function cancelActiveExportJob(jobId: string): boolean {
  const handle = activeProcessMap.get(jobId);
  if (handle) {
    handle.cancel();
    activeProcessMap.delete(jobId);
    return true;
  }
  return false;
}

/**
 * Executes FFmpeg export with streaming progress, log capture, and verification
 */
export function executeExportProcess(
  jobId: string,
  args: string[],
  totalDurationMs: number,
  outputPath: string,
  onProgress: (percent: number) => void,
  onLog: (line: string) => void
): Promise<{ success: boolean; outputPath: string; fileSizeBytes: number; error?: string }> {
  return new Promise((resolve) => {
    const ffmpegBin = getFfmpegBinary();
    const logs: string[] = [];
    let isCancelled = false;
    let settled = false;
    const stagingPath = createStorageStagingPath(outputPath);
    const stagedArgs = args.map((argument) => argument === outputPath ? stagingPath : argument);
    const cleanupFailedExport = async () => {
      await removeStorageFile(stagingPath);
      const outputDir = path.dirname(outputPath);
      if (path.basename(path.dirname(outputDir)) === 'exports' && path.basename(outputDir).startsWith('export-')) {
        await fs.promises.rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
      }
    };
    const fail = async (error: string) => {
      if (settled) return;
      settled = true;
      activeProcessMap.delete(jobId);
      await cleanupFailedExport();
      resolve({ success: false, outputPath, fileSizeBytes: 0, error });
    };

    const child = spawn(/*turbopackIgnore: true*/ ffmpegBin, stagedArgs, { windowsHide: true });

    activeProcessMap.set(jobId, {
      process: child,
      cancel: () => {
        isCancelled = true;
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', child.pid?.toString() || '', '/f', '/t']);
          } else {
            child.kill('SIGTERM');
          }
        } catch (err) {
          // Ignore kill error
        }
      },
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      logs.push(text);
      onLog(text);

      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
      if (timeMatch && totalDurationMs > 0) {
        const hours = parseFloat(timeMatch[1]);
        const minutes = parseFloat(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
        const percent = Math.min(100, Math.max(0, Math.round((currentMs / totalDurationMs) * 100)));
        onProgress(percent);
      }
    });

    child.on('error', (err) => {
      void fail(`Failed to spawn FFmpeg: ${err.message}`);
    });

    child.on('close', async (code) => {
      if (settled) return;
      activeProcessMap.delete(jobId);

      if (isCancelled) {
        return void await fail('Export job was cancelled by user');
      }

      if (code !== 0) {
        const errorSummary = logs.slice(-5).join('\n') || `FFmpeg process exited with code ${code}`;
        return void await fail(errorSummary);
      }

      if (!fs.existsSync(stagingPath)) {
        return void await fail(`Output file was not created at expected destination: ${outputPath}`);
      }

      try {
        const stats = fs.statSync(stagingPath);
        if (stats.size === 0) {
          return void await fail('Output file was created but contains 0 bytes');
        }

        await commitStorageFile(stagingPath, outputPath);
        const finalStats = fs.statSync(outputPath);
        settled = true;
        onProgress(100);
        return resolve({
          success: true,
          outputPath,
          fileSizeBytes: finalStats.size,
        });
      } catch (err: any) {
        return void await fail(`Failed to verify output file: ${err.message}`);
      }
    });
  });
}
