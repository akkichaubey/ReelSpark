import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { requireMediaUser } from "@/lib/media-api-access";
import { APP_CONFIG } from "@/lib/config";
import { mediaUserNamespace, recordMediaOwner } from "@/lib/media-access";
import { registerStorageTask } from "@/lib/storage-runtime";
import { backupPrivateMedia } from "@/lib/cloudflare/private-media";
import { validateCaptionRenderRequest } from "@/lib/media-validation";
import { compileTimeline, validateTimeline } from "@/lib/timeline/model";
import {
  resolveTimelineAsset,
  serveTimelineAssets,
} from "@/lib/timeline/render-assets";
import { probeVideo } from "@/lib/ffmpeg";
import { renderRemotionReelVideo } from "@/lib/caption-maker/remotion-renderer";
import { generatePhraseLevelSrt } from "@/lib/caption-maker/srt-generator";
import {
  mergeThumbnailIntoVideo,
  saveBase64Image,
} from "@/lib/caption-maker/thumbnail-merger";
import type { CaptionProject } from "@/lib/caption-maker/types";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const access = await requireMediaUser(req);
  if (access.error) return access.error;
  try {
    const text = await req.text();
    if (text.length > 8_000_000)
      return NextResponse.json(
        { error: "Timeline request is too large." },
        { status: 413 },
      );
    const body = JSON.parse(text);
    const project = body.timelineProject as CaptionProject;
    if (!project?.timeline?.enabled)
      return NextResponse.json(
        { error: "An enabled timeline is required." },
        { status: 400 },
      );
    const invalid =
      validateCaptionRenderRequest(
        project as unknown as Record<string, unknown>,
      ) || validateTimeline(project.timeline)[0];
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    project.timeline.fps = project.outputSettings.fps;
    const plan = compileTimeline(project);
    if (plan.durationMs <= 0)
      throw new Error("Add media or text before exporting.");
    const directory = path.join(
      APP_CONFIG.storageRoot,
      "caption-maker",
      "renders",
      mediaUserNamespace(access.user.id),
      `timeline_${randomUUID()}`,
    );
    const abort = new AbortController();
    const stop = () => abort.abort();
    req.signal.addEventListener("abort", stop, { once: true });
    if (req.signal.aborted) stop();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let server: Awaited<ReturnType<typeof serveTimelineAssets>> | undefined;
        let finish: (() => void) | undefined;
        const send = (event: unknown) => {
          if (!abort.signal.aborted)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
        };
        try {
          await recordMediaOwner(directory, access.user.id);
          const used = new Set(
            plan.timeline.clips.map((c) => c.assetId).filter(Boolean),
          );
          const files = new Map<string, string>();
          finish = registerStorageTask({
            id: `timeline_${randomUUID()}`,
            ownerId: access.user.id,
            kind: "render",
            paths: [directory],
            cancel: () => abort.abort(),
          });
          for (const asset of plan.timeline.assets.filter((a) =>
            used.has(a.id),
          )) {
            if (abort.signal.aborted) throw new Error("Render cancelled.");
            const filename = await resolveTimelineAsset(
              access.user.id,
              asset.fileUrl,
              req.nextUrl.origin,
            );
            files.set(asset.id, filename);
            if (asset.mediaType !== "image") {
              const metadata = await probeVideo(filename);
              if (!metadata.duration || metadata.duration > 14_400)
                throw new Error("Unsupported source duration.");
              if (asset.mediaType === "video" && !metadata.videoCodec)
                throw new Error("A video track requires video media.");
              if (asset.mediaType === "audio" && !metadata.hasAudio)
                throw new Error("An audio track requires an audio stream.");
              asset.durationMs = Math.round(metadata.duration * 1000);
              asset.hasAudio = metadata.hasAudio;
            }
          }
          finish?.();
          finish = registerStorageTask({
            id: `timeline_media_${randomUUID()}`,
            ownerId: access.user.id,
            kind: "render",
            paths: [directory, ...files.values()],
            cancel: () => abort.abort(),
          });
          const errors = validateTimeline(plan.timeline);
          if (errors.length) throw new Error(errors[0]);
          server = await serveTimelineAssets(files);
          plan.timeline.assets = plan.timeline.assets
            .filter((a) => used.has(a.id))
            .map((a) => ({ ...a, fileUrl: server!.url(a.id) }));
          const output = path.join(directory, "reel.mp4"),
            srt = path.join(directory, "reel.srt");
          await fs.writeFile(srt, generatePhraseLevelSrt(plan.captionGroups));
          send({ type: "progress", progress: 5 });
          const result = await renderRemotionReelVideo({
            timelinePlan: plan,
            sfxCues: plan.sfxCues,
            outputPath: output,
            groups: plan.captionGroups,
            words: plan.transcript,
            style: project.captionStyle,
            outputSettings: project.outputSettings,
            speaker1Color: project.speaker1Color,
            speaker2Color: project.speaker2Color,
            signal: abort.signal,
            onProgress: (progress) => send({ type: "progress", progress }),
          });
          let thumbnailMerged = false;
          let thumbnailUrl: string | undefined;
          if (
            body.mergeThumbnail !== false &&
            typeof body.thumbnailDataUrl === "string"
          ) {
            const cover = path.join(directory, "cover.png");
            await saveBase64Image(body.thumbnailDataUrl, cover);
            await mergeThumbnailIntoVideo({
              videoPath: output,
              thumbnailPath: cover,
              mergeMode: [
                "intro_and_poster",
                "intro_hook",
                "poster_only",
              ].includes(body.thumbnailMergeMode)
                ? body.thumbnailMergeMode
                : "intro_and_poster",
              introDuration: Number(body.thumbnailIntroDuration) || 0.01,
              width: project.outputSettings.width,
              height: project.outputSettings.height,
              signal: abort.signal,
            });
            thumbnailMerged = true;
            thumbnailUrl = `/api/files/${path.relative(APP_CONFIG.storageRoot, cover).split(path.sep).join("/")}`;
            await backupPrivateMedia(access.user.id, cover);
          }
          await backupPrivateMedia(access.user.id, output);
          await backupPrivateMedia(access.user.id, srt);
          const url = (file: string) =>
            `/api/files/${path.relative(APP_CONFIG.storageRoot, file).split(path.sep).join("/")}`;
          send({
            type: "complete",
            success: true,
            videoUrl: url(output),
            videoPath: output,
            srtUrl: url(srt),
            srtPath: srt,
            duration: result.duration,
            thumbnailMerged,
            thumbnailUrl,
          });
        } catch (error) {
          send({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Timeline render failed.",
          });
        } finally {
          await server?.close();
          finish?.();
          req.signal.removeEventListener("abort", stop);
          try {
            controller.close();
          } catch {
            /* Client disconnected. */
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid timeline." },
      { status: 400 },
    );
  }
}
