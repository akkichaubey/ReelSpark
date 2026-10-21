import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import {
  MediaServiceHealthResponse,
  ProbeRequestSchema,
  ValidatePathRequestSchema,
} from '../../src/lib/clipping-studio/contracts';

const execFileAsync = promisify(execFile);

const HOST = process.env.MEDIA_SERVICE_HOST || '127.0.0.1';
const PORT = parseInt(process.env.MEDIA_SERVICE_PORT || '4000', 10);
const SERVICE_TOKEN = process.env.MEDIA_SERVICE_TOKEN;
const START_TIME = Date.now();

// Binary resolution
function resolveBinary(envVar: string | undefined, defaultName: string): string {
  if (envVar && fs.existsSync(envVar)) return envVar;
  const localBin = path.join(process.cwd(), 'bin', process.platform === 'win32' ? `${defaultName}.exe` : defaultName);
  if (fs.existsSync(localBin)) return localBin;
  return process.platform === 'win32' ? `${defaultName}.exe` : defaultName;
}

const FFMPEG_BIN = resolveBinary(process.env.FFMPEG_PATH, 'ffmpeg');
const FFPROBE_BIN = resolveBinary(process.env.FFPROBE_PATH, 'ffprobe');

// Check FFmpeg / FFprobe status
async function getFfmpegInfo(): Promise<{ available: boolean; path: string; version?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(FFMPEG_BIN, ['-version']);
    const firstLine = (stdout || stderr).split('\n')[0]?.trim() || '';
    return { available: true, path: FFMPEG_BIN, version: firstLine };
  } catch (err: any) {
    return { available: false, path: FFMPEG_BIN, error: err.message };
  }
}

async function getFfprobeInfo(): Promise<{ available: boolean; path: string; version?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(FFPROBE_BIN, ['-version']);
    const firstLine = (stdout || stderr).split('\n')[0]?.trim() || '';
    return { available: true, path: FFPROBE_BIN, version: firstLine };
  } catch (err: any) {
    return { available: false, path: FFPROBE_BIN, error: err.message };
  }
}

// In-memory jobs tracking
const activeJobs = new Map<string, any>();
const activeProcesses = new Map<string, ChildProcess>();

function startJobExecution(job: any) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  job.progressPercent = 0;
  job.logs = job.logs || [];

  // Safe execution with direct binary and argument array
  const child = spawn(FFMPEG_BIN, job.args, { windowsHide: true });
  activeProcesses.set(job.id, child);

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    job.logs.push(text);
    if (job.logs.length > 200) job.logs.shift();

    if (job.totalDurationMs && job.totalDurationMs > 0) {
      const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
      if (timeMatch) {
        const hours = parseFloat(timeMatch[1]);
        const minutes = parseFloat(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
        job.progressPercent = Math.min(99, Math.max(0, Math.round((currentMs / job.totalDurationMs) * 100)));
      }
    }
  });

  child.on('error', (err) => {
    activeProcesses.delete(job.id);
    job.status = 'failed';
    job.errorMessage = `Failed to spawn FFmpeg: ${err.message}`;
    job.completedAt = new Date().toISOString();
  });

  child.on('close', (code) => {
    activeProcesses.delete(job.id);
    if (job.status === 'cancelled') {
      return;
    }
    if (code !== 0) {
      job.status = 'failed';
      job.errorMessage = job.logs.slice(-3).join('\n') || `FFmpeg exited with code ${code}`;
      job.completedAt = new Date().toISOString();
      return;
    }

    if (!fs.existsSync(job.outputPath)) {
      job.status = 'failed';
      job.errorMessage = `Output file not found at ${job.outputPath}`;
      job.completedAt = new Date().toISOString();
      return;
    }

    try {
      const stats = fs.statSync(job.outputPath);
      if (stats.size === 0) {
        job.status = 'failed';
        job.errorMessage = 'Output file has 0 bytes';
        job.completedAt = new Date().toISOString();
        return;
      }

      job.status = 'completed';
      job.progressPercent = 100;
      job.fileSizeBytes = stats.size;
      job.completedAt = new Date().toISOString();
    } catch (err: any) {
      job.status = 'failed';
      job.errorMessage = `Failed to inspect output file: ${err.message}`;
      job.completedAt = new Date().toISOString();
    }
  });
}

function cancelJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  const child = activeProcesses.get(jobId);
  if (child) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid?.toString() || '', '/f', '/t']);
      } else {
        child.kill('SIGTERM');
      }
    } catch {}
    activeProcesses.delete(jobId);
  }
  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();

  if (job.outputPath && fs.existsSync(job.outputPath)) {
    try {
      fs.unlinkSync(job.outputPath);
    } catch {}
  }
  return true;
}

function retryJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  job.status = 'queued';
  job.progressPercent = 0;
  job.errorMessage = undefined;
  job.logs = [];
  startJobExecution(job);
  return true;
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-media-service-token',
  });
  res.end(json);
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        // 5MB max payload for metadata requests
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Malformed JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-media-service-token',
    });
    res.end();
    return;
  }

  // Security check: Verify Host is local
  const rawHost = (req.headers.host || '').split(':')[0].toLowerCase();
  const isLocalHost = rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '::1';
  if (!isLocalHost) {
    sendJson(res, 403, { success: false, error: 'Access denied: Media service only accessible via 127.0.0.1/localhost' });
    return;
  }

  // Token protection (if configured)
  if (SERVICE_TOKEN) {
    const clientToken = req.headers['x-media-service-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (clientToken !== SERVICE_TOKEN) {
      sendJson(res, 401, { success: false, error: 'Unauthorized: Invalid x-media-service-token' });
      return;
    }
  }

  const url = req.url?.split('?')[0] || '';

  try {
    // 1. Health Check Endpoint
    if (req.method === 'GET' && (url === '/health' || url === '/api/health')) {
      const ffmpeg = await getFfmpegInfo();
      const ffprobe = await getFfprobeInfo();

      const healthData: MediaServiceHealthResponse = {
        status: 'ok',
        service: 'reelspark-media-service',
        version: '1.0.0',
        host: HOST,
        port: PORT,
        uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
        ffmpeg,
        ffprobe,
      };

      sendJson(res, 200, healthData);
      return;
    }

    // 2. Validate Local File Path
    if (req.method === 'POST' && url === '/api/validate-path') {
      const body = await parseJsonBody(req);
      const parsed = ValidatePathRequestSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' });
        return;
      }

      const { filePath } = parsed.data;
      if (!fs.existsSync(filePath)) {
        sendJson(res, 200, { exists: false, readable: false, isMedia: false, error: 'File does not exist' });
        return;
      }

      try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
          sendJson(res, 200, { exists: true, readable: false, isMedia: false, error: 'Path is a directory, not a file' });
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mediaExtensions = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
        const isMedia = mediaExtensions.includes(ext);

        sendJson(res, 200, {
          exists: true,
          readable: true,
          fileSizeBytes: stats.size,
          filename: path.basename(filePath),
          extension: ext,
          isMedia,
        });
        return;
      } catch (err: any) {
        sendJson(res, 200, { exists: true, readable: false, isMedia: false, error: err.message });
        return;
      }
    }

    // 3. Inspect Media via FFprobe (Safe argument array)
    if (req.method === 'POST' && url === '/api/probe') {
      const body = await parseJsonBody(req);
      const parsed = ProbeRequestSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' });
        return;
      }

      const { filePath } = parsed.data;
      if (!fs.existsSync(filePath)) {
        sendJson(res, 404, { success: false, error: `Media file does not exist: ${filePath}` });
        return;
      }

      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration,size,format_name,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels,bit_rate',
        '-of', 'json',
        filePath,
      ];

      const { stdout } = await execFileAsync(FFPROBE_BIN, args);
      const data = JSON.parse(stdout);

      const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
      const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');

      const durationSeconds = parseFloat(data.format?.duration || videoStream?.duration || audioStream?.duration || '0');
      const durationMs = Math.round(durationSeconds * 1000);
      const sizeBytes = parseInt(data.format?.size || '0', 10);
      const formatName = data.format?.format_name || 'unknown';

      let fps: number | undefined = undefined;
      if (videoStream?.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        if (den && num) {
          fps = Math.round((num / den) * 100) / 100;
        }
      }

      let aspectRatio = '16:9';
      if (videoStream?.width && videoStream?.height) {
        const ratio = videoStream.width / videoStream.height;
        if (Math.abs(ratio - 16 / 9) < 0.05) aspectRatio = '16:9';
        else if (Math.abs(ratio - 9 / 16) < 0.05) aspectRatio = '9:16';
        else if (Math.abs(ratio - 4 / 3) < 0.05) aspectRatio = '4:3';
        else if (Math.abs(ratio - 1) < 0.05) aspectRatio = '1:1';
        else aspectRatio = `${videoStream.width}:${videoStream.height}`;
      } else if (!videoStream && audioStream) {
        aspectRatio = 'Audio';
      }

      const metadata = {
        durationSeconds,
        durationMs,
        sizeBytes,
        formatName,
        width: videoStream?.width,
        height: videoStream?.height,
        fps,
        aspectRatio,
        hasVideo: Boolean(videoStream),
        hasAudio: Boolean(audioStream),
        videoCodec: videoStream?.codec_name,
        audioCodec: audioStream?.codec_name,
        audioChannels: audioStream?.channels,
        sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
        streams: data.streams || [],
      };

      sendJson(res, 200, { success: true, metadata });
      return;
    }

    // 4. Jobs List Endpoint
    if (req.method === 'GET' && url === '/api/jobs') {
      sendJson(res, 200, { success: true, jobs: Array.from(activeJobs.values()) });
      return;
    }

    // 5. Submit Export Job (safe argument array, no shell execution)
    if (req.method === 'POST' && url === '/api/export') {
      const body = await parseJsonBody(req);
      const {
        jobId,
        projectId,
        jobType,
        targetId,
        args,
        outputPath,
        totalDurationMs,
        sourceMappings,
        outputSettings,
      } = body;

      if (!jobId || !projectId || !outputPath || !Array.isArray(args)) {
        sendJson(res, 400, {
          success: false,
          error: 'Missing required parameters: jobId, projectId, outputPath, and args array are required',
        });
        return;
      }

      // Ensure directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const job = {
        id: jobId,
        projectId,
        jobType: jobType || 'single_clip',
        targetId: targetId || jobId,
        status: 'queued',
        progressPercent: 0,
        outputPath,
        args,
        totalDurationMs: totalDurationMs || 0,
        sourceMappings: sourceMappings || [],
        outputSettings: outputSettings || {},
        logs: [],
        createdAt: new Date().toISOString(),
      };

      activeJobs.set(jobId, job);
      startJobExecution(job);

      sendJson(res, 202, { success: true, job });
      return;
    }

    // 6. Single Job Details Endpoint
    const singleJobMatch = url.match(/^\/api\/jobs\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && singleJobMatch) {
      const jobId = singleJobMatch[1];
      const job = activeJobs.get(jobId);
      if (!job) {
        sendJson(res, 404, { success: false, error: `Job not found: ${jobId}` });
        return;
      }
      sendJson(res, 200, { success: true, job });
      return;
    }

    // 7. Cancel Job Endpoint
    const cancelJobMatch = url.match(/^\/api\/jobs\/([a-zA-Z0-9_-]+)\/cancel$/);
    if (req.method === 'POST' && cancelJobMatch) {
      const jobId = cancelJobMatch[1];
      const cancelled = cancelJob(jobId);
      if (!cancelled) {
        sendJson(res, 404, { success: false, error: `Job not found or already completed: ${jobId}` });
        return;
      }
      sendJson(res, 200, { success: true, job: activeJobs.get(jobId) });
      return;
    }

    // 8. Retry Job Endpoint
    const retryJobMatch = url.match(/^\/api\/jobs\/([a-zA-Z0-9_-]+)\/retry$/);
    if (req.method === 'POST' && retryJobMatch) {
      const jobId = retryJobMatch[1];
      const retried = retryJob(jobId);
      if (!retried) {
        sendJson(res, 404, { success: false, error: `Job not found: ${jobId}` });
        return;
      }
      sendJson(res, 200, { success: true, job: activeJobs.get(jobId) });
      return;
    }

    // 404 Route
    sendJson(res, 404, { success: false, error: `Route not found: ${req.method} ${url}` });
  } catch (err: any) {
    console.error('[Media Service Error]', err);
    sendJson(res, 500, { success: false, error: err.message || 'Internal media service error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ReelSpark Media Service] Running securely on http://${HOST}:${PORT}`);
  console.log(`[ReelSpark Media Service] FFmpeg: ${FFMPEG_BIN}`);
  console.log(`[ReelSpark Media Service] FFprobe: ${FFPROBE_BIN}`);
});

export { server };
