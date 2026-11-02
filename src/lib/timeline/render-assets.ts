import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { assertSafePath, resolveStoragePath } from "../storage";
import { canUseRenderMedia } from "../media-access";
import { restorePrivateMedia } from "../cloudflare/private-media";

/** Resolve only owned uploads and shipped assets. Never fetch a client-supplied network URL. */
export async function resolveTimelineAsset(
  owner: string,
  url: string,
  origin: string,
): Promise<string> {
  const parsed = new URL(url, origin);
  if (parsed.origin !== origin || parsed.search || parsed.hash)
    throw new Error("Timeline media must use an app-managed URL.");
  const relative = decodeURIComponent(parsed.pathname);
  let filename: string;
  if (relative.startsWith("/api/files/")) {
    filename = resolveStoragePath(relative.slice(11));
    if (!(await canUseRenderMedia(owner, filename)))
      await restorePrivateMedia(owner, filename);
  } else {
    const root = path.resolve(process.cwd(), "public");
    filename = assertSafePath(path.join(root, relative), root);
  }
  if (!(await canUseRenderMedia(owner, filename)))
    throw new Error("Timeline media unavailable for this account.");
  return filename;
}

/** Bounded streaming for Chromium/FFmpeg, scoped to one render and a random capability. */
export async function serveTimelineAssets(files: Map<string, string>) {
  const token = randomBytes(32).toString("hex");
  const server = http.createServer(async (request, response) => {
    try {
      response.setHeader("Access-Control-Allow-Origin", "*");
      const parts = (request.url || "").split("/");
      const filename = parts[1] === token ? files.get(parts[2]) : undefined;
      if (!filename || !["GET", "HEAD"].includes(request.method || "")) {
        response.writeHead(404).end();
        return;
      }
      const stat = await fsp.stat(filename);
      const size = stat.size;
      const types: Record<string, string> = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      };
      response.setHeader(
        "Content-Type",
        types[path.extname(filename).toLowerCase()] ||
          "application/octet-stream",
      );
      response.setHeader("Accept-Ranges", "bytes");
      let start = 0,
        end = size - 1;
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) {
          response.writeHead(416).end();
          return;
        }
        if (!match[1]) start = Math.max(0, size - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        }
        if (!Number.isSafeInteger(start) || start > end || start >= size) {
          response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
          return;
        }
        response.statusCode = 206;
        response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      }
      response.setHeader("Content-Length", end - start + 1);
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = fs.createReadStream(filename, { start, end });
      response.once("close", () => stream.destroy());
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as { port: number }).port;
  return {
    url: (id: string) => `http://127.0.0.1:${port}/${token}/${id}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
