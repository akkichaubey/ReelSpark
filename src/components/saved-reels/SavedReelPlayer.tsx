'use client';
import { useEffect, useRef, useState } from 'react';
import { CaptionPreview } from '@/components/caption-maker/CaptionPreview';
import type { CaptionProject } from '@/lib/caption-maker/types';
import { reelPlayback } from '@/lib/saved-reels/types';

export function SavedReelPlayer({ project }: { project: CaptionProject }) {
  const playback = reelPlayback(project);
  const voice = useRef<HTMLAudioElement>(null);
  const bgm = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(playback.start);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!bgm.current) return;
    bgm.current.volume = project.bgMusic?.muted
      ? 0
      : Math.min(1, project.bgMusic?.volume ?? 0.2);
    if (playing) void bgm.current.play().catch(() => undefined);
    else bgm.current.pause();
  }, [playing, project.bgMusic]);
  if (!playback.url)
    return <p>No playable media. Open the reel to add media.</p>;
  if (playback.rendered)
    return (
      <video
        controls
        autoPlay
        playsInline
        src={playback.url}
        className="max-h-[65vh] w-full bg-black"
        onError={() =>
          setError(
            'Rendered media unavailable. Open the reel to render it again.'
          )
        }
      />
    );
  const seek = (seconds: number) => {
    const next = Math.min(playback.end, Math.max(playback.start, seconds));
    if (voice.current) voice.current.currentTime = next;
    if (bgm.current && bgm.current.duration)
      bgm.current.currentTime =
        (next + (project.bgMusic?.startOffset || 0)) % bgm.current.duration;
    setTime(next);
  };
  const toggle = () => {
    const audio = voice.current;
    if (!audio) return;
    if (playing) audio.pause();
    else {
      if (
        audio.currentTime < playback.start ||
        audio.currentTime >= playback.end
      )
        seek(playback.start);
      void audio
        .play()
        .catch(() => setError('Playback could not start. Try again.'));
    }
  };
  return (
    <div className="space-y-3">
      <div className="h-[min(55vh,540px)] flex justify-center overflow-hidden bg-black">
        <CaptionPreview
          image={project.image}
          audioUrl={project.audio?.fileUrl}
          transcript={project.transcript}
          captionGroups={project.captionGroups}
          captionStyle={project.captionStyle}
          outputSettings={project.outputSettings}
          currentTime={time}
          isPlaying={playing}
          onTogglePlay={toggle}
          onSeek={seek}
          totalDuration={project.audio?.duration || playback.end}
          speaker1Color={project.speaker1Color}
          speaker2Color={project.speaker2Color}
          sfxCues={project.sfxCues}
          autoSfxEnabled={project.autoSfxEnabled}
        />
      </div>
      <audio
        ref={voice}
        src={project.audio?.fileUrl || playback.url}
        onLoadedMetadata={() => {
          seek(playback.start);
          if (voice.current)
            voice.current.volume = project.voiceMuted
              ? 0
              : Math.min(1, project.voiceVolume ?? 1);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError('Media is unavailable. Please try again.')}
        onTimeUpdate={() => {
          const audio = voice.current;
          if (!audio) return;
          if (audio.currentTime >= playback.end) {
            audio.pause();
            seek(playback.start);
          } else setTime(audio.currentTime);
        }}
      />
      {project.bgMusic?.fileUrl && (
        <audio ref={bgm} src={project.bgMusic.fileUrl} loop />
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="rounded bg-amber-400 px-4 py-2 font-bold text-black"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          aria-label="Reel preview timeline"
          type="range"
          min={playback.start}
          max={playback.end}
          step="0.001"
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          className="min-w-0 flex-1 accent-amber-400"
        />
        <span className="text-xs tabular-nums">
          {(time - playback.start).toFixed(2)} /{' '}
          {(playback.end - playback.start).toFixed(2)}s
        </span>
      </div>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <p className="text-xs text-zinc-400">
        Editable preview · Export from Reel Maker for the final video.
      </p>
    </div>
  );
}
