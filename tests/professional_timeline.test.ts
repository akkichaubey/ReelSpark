import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { APP_CONFIG, getFfmpegPath } from "../src/lib/config";
import { createEmptyCaptionProject } from "../src/lib/caption-maker/sample-data";
import {
  commitTimeline,
  groupTimelineClips,
  synchronizeTimelineSources,
  compileTimeline,
  createTimelineClip,
  createTimelineTrack,
  deleteTimelineClips,
  moveTimelineClips,
  pasteTimelineClips,
  splitTimelineClips,
  timelineFromProject,
  trimTimelineClip,
  validateTimeline,
} from "../src/lib/timeline/model";
import {
  extractWaveform,
  timelineMediaPreview,
} from "../src/lib/timeline/media-previews";
import { recordMediaOwner } from "../src/lib/media-access";
import {
  resolveTimelineAsset,
  serveTimelineAssets,
} from "../src/lib/timeline/render-assets";
import { renderRemotionReelVideo } from "../src/lib/caption-maker/remotion-renderer";
import { probeVideo } from "../src/lib/ffmpeg";
import { retainReelProject } from "../src/lib/saved-reels/storage";

const execute = promisify(execFile);
async function main() {
  const project = createEmptyCaptionProject();
  project.audio = {
    id: "voice",
    fileUrl: "/api/files/voice.wav",
    fileName: "voice.wav",
    duration: 4,
    fileSize: 1,
    format: "wav",
  };
  project.transcript = [
    { id: "w1", text: "Manual", start: 0.5, end: 1 },
    { id: "w2", text: "caption", start: 2.1, end: 2.6 },
  ];
  project.captionGroups = [
    {
      id: "g1",
      start: 0.5,
      end: 2.6,
      text: "Manual caption",
      words: project.transcript,
    },
  ];
  const original = JSON.stringify(project);
  let timeline = timelineFromProject(project);
  assert.equal(timeline.enabled, false);
  assert.equal(JSON.stringify(project), original);
  const voice = timeline.clips.find((c) => c.trackId === "track_voice")!;
  const caption = timeline.clips.find((c) => c.trackId === "track_captions")!;
  timeline = moveTimelineClips(timeline, [voice.id], 1000);
  assert.equal(timeline.clips.find((c) => c.id === caption.id)!.startMs, 1000);
  let plan = compileTimeline({ ...project, timeline });
  assert.equal(plan.transcript[0].start, 1.5);
  assert.equal(plan.transcript[0].text, "Manual");
  timeline = splitTimelineClips(timeline, [voice.id], 3000);
  assert.equal(timeline.clips.length, 4);
  plan = compileTimeline({ ...project, timeline });
  assert.equal(plan.transcript.length, 2);
  assert.equal(plan.transcript[1].start, 3.1);
  const right = timeline.clips.find(
    (c) => c.trackId === "track_voice" && c.startMs === 3000,
  )!;
  timeline = trimTimelineClip(timeline, right.id, "left", 100);
  assert.equal(
    timeline.clips.find((c) => c.id === right.id)!.sourceStartMs,
    2100,
  );
  assert.throws(
    () =>
      moveTimelineClips(
        {
          ...timeline,
          tracks: timeline.tracks.map((t) =>
            t.kind === "captions" ? { ...t, locked: true } : t,
          ),
        },
        [right.id],
        1000,
      ),
    /Unlock/,
  );
  assert.throws(
    () => trimTimelineClip(timeline, right.id, "right", 5000),
    /source/,
  );
  const copied = timeline.clips.filter((c) => c.startMs === 3100);
  const pasted = pasteTimelineClips(timeline, copied, 6000);
  assert.equal(pasted.clips.length, 6);
  assert.notEqual(pasted.clips.at(-1)!.linkId, right.linkId);
  assert.equal(
    deleteTimelineClips(pasted, [pasted.clips.at(-1)!.id]).clips.length,
    4,
  );
  assert.deepEqual(validateTimeline({} as never), [
    "Invalid timeline document.",
  ]);
  const vt = createTimelineTrack("video");
  const va = {
    id: "video",
    fileUrl: "/video.mp4",
    fileName: "video.mp4",
    mediaType: "video" as const,
    durationMs: 4000,
  };
  const first = createTimelineClip(vt, va, 0, 2000),
    second = createTimelineClip(vt, va, 1500, 2000);
  assert.throws(
    () =>
      commitTimeline({
        ...timeline,
        tracks: [vt],
        assets: [va],
        clips: [first, second],
      }),
    /overlap/,
  );
  assert.equal(
    validateTimeline({
      ...timeline,
      tracks: [vt],
      assets: [va],
      clips: [first, { ...second, transitionIn: "crossfade", fadeInMs: 500 }],
    }).length,
    0,
  );
  assert.throws(
    () =>
      moveTimelineClips(timeline, [right.id], 0, {
        clipId: right.id,
        trackId: "track_video",
      }),
    /compatible/,
  );
  const composed = { ...project, timeline };
  const mixed = synchronizeTimelineSources(composed, {
    ...composed,
    voiceVolume: 0.5,
  });
  assert.equal(
    mixed.timeline!.clips.find((c) => c.id === voice.id)!.volume,
    0.5,
  );
  const replaced = synchronizeTimelineSources(composed, {
    ...composed,
    audio: { ...project.audio!, id: "new_voice" },
  });
  assert.deepEqual(
    replaced.timeline!.captionSources.voice.transcript,
    project.transcript,
  );
  const music = synchronizeTimelineSources(composed, {
    ...composed,
    bgMusic: {
      id: "bgm_one",
      title: "Music",
      fileUrl: "/audio/bgm/one.mp3",
      volume: 0.2,
    },
  });
  assert.ok(music.timeline!.clips.some((c) => c.assetId === "bgm_one"));
  const noMusic = synchronizeTimelineSources(music, {
    ...music,
    bgMusic: undefined,
  });
  assert.ok(noMusic.timeline!.clips.every((c) => c.assetId !== "bgm_one"));
  const grouped = groupTimelineClips(
    timeline,
    timeline.clips.map((c) => c.id),
    true,
  );
  assert.equal(new Set(grouped.clips.map((c) => c.linkId)).size, 1);
  assert.ok(
    groupTimelineClips(grouped, [grouped.clips[0].id], false).clips.every(
      (c) => !c.linkId,
    ),
  );
  console.log(
    "PASS model: linked edits, source bounds, manual captions, clipboard, locks, overlap/crossfade, legacy compatibility",
  );

  const owner = `timeline_test_${randomUUID()}`;
  const directory = path.join(
    APP_CONFIG.storageRoot,
    "caption-maker",
    `asset_${owner}`,
  );
  await recordMediaOwner(directory, owner);
  const url = (file: string) =>
    `/api/files/${path.relative(APP_CONFIG.storageRoot, path.join(directory, file)).split(path.sep).join("/")}`;
  let server: Awaited<ReturnType<typeof serveTimelineAssets>> | undefined;
  try {
    const ff = getFfmpegPath();
    for (const [name, filter] of [
      ["voice.wav", "sine=frequency=440:duration=2"],
      ["silence.wav", "anullsrc=r=8000:cl=mono"],
    ] as const)
      await execute(ff, [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        filter,
        "-t",
        "2",
        path.join(directory, name),
      ]);
    for (const color of ["red", "blue"])
      await execute(ff, [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=320x320:d=2:r=30`,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        path.join(directory, `${color}.mp4`),
      ]);
    const wave = await extractWaveform(path.join(directory, "voice.wav"), 2),
      silence = await extractWaveform(path.join(directory, "silence.wav"), 2);
    assert.ok(wave.some((p) => p > 0.05));
    assert.ok(silence.every((p) => p === 0));
    assert.ok(wave.length <= 2048);
    const preview = await timelineMediaPreview(
      owner,
      url("red.mp4"),
      "http://localhost:3000",
    );
    assert.equal(preview.thumbnails.length, 4);
    assert.equal(preview.peaks.length, 0);
    const audioPreview = await timelineMediaPreview(
      owner,
      url("voice.wav"),
      "http://localhost:3000",
    );
    assert.equal(audioPreview.thumbnails.length, 0);
    assert.ok(audioPreview.peaks.length > 0);
    assert.deepEqual(
      await timelineMediaPreview(
        owner,
        url("red.mp4"),
        "http://localhost:3000",
      ),
      preview,
    );
    await assert.rejects(
      timelineMediaPreview(
        "other_owner",
        url("red.mp4"),
        "http://localhost:3000",
      ),
    );
    await assert.rejects(
      resolveTimelineAsset(
        owner,
        "https://example.com/private.mp4",
        "http://localhost:3000",
      ),
    );
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      extractWaveform(path.join(directory, "voice.wav"), 2, cancelled.signal),
    );
    console.log(
      "PASS real media: sine/silence waveforms, video thumbnails, cache, ownership, SSRF rejection, cancellation",
    );
    const reel = createEmptyCaptionProject();
    reel.outputSettings = {
      ...reel.outputSettings,
      width: 320,
      height: 320,
      fps: 30,
    };
    const tracks = [
      createTimelineTrack("text"),
      createTimelineTrack("video"),
      createTimelineTrack("audio"),
    ];
    const assets = [
      {
        id: "red",
        fileUrl: url("red.mp4"),
        fileName: "red.mp4",
        mediaType: "video" as const,
        durationMs: 2000,
        hasAudio: false,
      },
      {
        id: "blue",
        fileUrl: url("blue.mp4"),
        fileName: "blue.mp4",
        mediaType: "video" as const,
        durationMs: 2000,
        hasAudio: false,
      },
      {
        id: "tone",
        fileUrl: url("voice.wav"),
        fileName: "voice.wav",
        mediaType: "audio" as const,
        durationMs: 2000,
        hasAudio: true,
      },
    ];
    reel.timeline = commitTimeline({
      ...timelineFromProject(reel),
      tracks,
      assets,
      clips: [
        createTimelineClip(tracks[1], assets[0], 1000, 1000),
        createTimelineClip(tracks[1], assets[1], 2000, 1000),
        createTimelineClip(tracks[2], assets[2], 1000, 2000),
        {
          ...createTimelineClip(tracks[0], undefined, 2000, 1000),
          text: {
            value: "TIMELINE",
            fontFamily: "Arial",
            fontSize: 32,
            color: "#ffffff",
            background: "#00000000",
            x: 50,
            y: 50,
          },
        },
      ],
    });
    const retained = await retainReelProject(
      owner,
      reel,
      "http://localhost:3000",
    );
    assert.equal(retained.timeline!.clips.length, 4);
    assert.equal(retained.timeline!.clips[0].startMs, 1000);
    assert.notEqual(retained.timeline!.assets[0].fileUrl, assets[0].fileUrl);
    console.log(
      "PASS Saved Reels: complete timeline retained with independent media",
    );
    if (
      process.env.TIMELINE_RENDER_TEST === "true" ||
      process.argv.includes("--render")
    ) {
      const files = new Map(
        assets.map((a) => [a.id, path.join(directory, a.fileName)]),
      );
      server = await serveTimelineAssets(files);
      const response = await fetch(server.url("red"), {
        headers: { Range: "bytes=0-31" },
      });
      assert.equal(response.status, 206);
      assert.equal((await response.arrayBuffer()).byteLength, 32);
      assert.equal((await fetch(server.url("missing"))).status, 404);
      const renderPlan = compileTimeline(reel);
      renderPlan.timeline.assets = assets.map((a) => ({
        ...a,
        fileUrl: server!.url(a.id),
      }));
      process.env.CHROME_PATH ||=
        "C:/Program Files/Google/Chrome/Application/chrome.exe";
      const output = path.join(directory, "result.mp4");
      await renderRemotionReelVideo({
        timelinePlan: renderPlan,
        outputPath: output,
        groups: [],
        words: [],
        style: reel.captionStyle,
        outputSettings: reel.outputSettings,
      });
      const metadata = await probeVideo(output);
      assert.ok(Math.abs(metadata.duration - 3) < 0.05);
      assert.equal(metadata.hasAudio, true);
      for (const [time, color] of [
        [0.5, "black"],
        [1.5, "red"],
        [2.5, "blue"],
      ] as const) {
        const { stdout } = await execute(
          ff,
          [
            "-v",
            "error",
            "-ss",
            String(time),
            "-i",
            output,
            "-frames:v",
            "1",
            "-vf",
            "crop=2:2:10:10",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
          ],
          { encoding: "buffer" },
        );
        const [r, g, b] = stdout;
        assert.ok(
          color === "black"
            ? r < 20 && g < 20 && b < 20
            : color === "red"
              ? r > 180 && g < 60 && b < 60
              : b > 180 && r < 60,
          `${time}s should be ${color}: ${r},${g},${b}`,
        );
      }
      const frame = await execute(
        ff,
        [
          "-v",
          "error",
          "-ss",
          "2.5",
          "-i",
          output,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 2_000_000 },
      );
      let white = 0;
      for (let i = 0; i < frame.stdout.length; i += 3)
        if (
          frame.stdout[i] > 190 &&
          frame.stdout[i + 1] > 190 &&
          frame.stdout[i + 2] > 190
        )
          white++;
      assert.ok(
        white > 30,
        "Text overlay must appear in the actual rendered frame",
      );
      const dissolvePlan = compileTimeline({
        ...reel,
        timeline: {
          ...reel.timeline!,
          clips: [
            { ...reel.timeline!.clips[0], startMs: 0, durationMs: 2000 },
            {
              ...reel.timeline!.clips[1],
              startMs: 1500,
              durationMs: 2000,
              transitionIn: "crossfade",
              fadeInMs: 500,
            },
            {
              ...reel.timeline!.clips[2],
              startMs: 0,
              fadeInMs: 500,
              fadeOutMs: 500,
            },
          ],
        },
      });
      dissolvePlan.timeline.assets = renderPlan.timeline.assets;
      const dissolve = path.join(directory, "dissolve.mp4");
      await renderRemotionReelVideo({
        timelinePlan: dissolvePlan,
        outputPath: dissolve,
        groups: [],
        words: [],
        style: reel.captionStyle,
        outputSettings: reel.outputSettings,
      });
      const blend = await execute(
        ff,
        [
          "-v",
          "error",
          "-ss",
          "1.75",
          "-i",
          dissolve,
          "-frames:v",
          "1",
          "-vf",
          "crop=2:2:10:10",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { encoding: "buffer" },
      );
      assert.ok(
        blend.stdout[0] > 70 && blend.stdout[2] > 70,
        "Cross dissolve must blend red and blue sources",
      );
      const samples = await execute(
        ff,
        [
          "-v",
          "error",
          "-i",
          dissolve,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "8000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 2_000_000 },
      );
      const rms = (start: number, end: number) => {
        let sum = 0,
          count = 0;
        for (
          let i = Math.floor(start * 8000) * 2;
          i < Math.min(samples.stdout.length, end * 8000 * 2);
          i += 2
        ) {
          sum += samples.stdout.readInt16LE(i) ** 2;
          count++;
        }
        return Math.sqrt(sum / Math.max(1, count));
      };
      assert.ok(
        rms(0.7, 0.9) > rms(0.02, 0.12) * 2,
        "Audio fade-in must affect exported samples",
      );
      assert.ok(
        rms(0.7, 0.9) > rms(1.85, 1.95) * 2,
        "Audio fade-out must affect exported samples",
      );
      console.log(
        "PASS rendered cross dissolve, text pixels and measured audio fade-in / fade-out",
      );
      console.log(
        "PASS real Remotion export: gap → red → blue, text layer, audio, exact 3-second timebase, scoped HTTP range streaming",
      );
    }
  } finally {
    await server?.close(); /* Retained QA media is left for the normal orphan grace-period cleanup. */
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
