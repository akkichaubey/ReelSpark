import React from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { BackgroundLayer } from './BackgroundLayer';
import { GsapAnimatedCaptions } from './GsapAnimatedCaptions';
import { RemotionCaptionProps } from './types';

export const CaptionReel: React.FC<RemotionCaptionProps> = ({
  imageSrc,
  audioSrc,
  voiceVolume,
  voiceMuted,
  bgMusicSrc,
  bgMusicVolume,
  bgMusicMuted,
  bgMusicFadeIn = 0.8,
  bgMusicFadeOut = 1.2,
  bgMusicAutoDucking = true,
  bgMusicOffset = 0,
  sfxCues,
  autoSfxEnabled = true,
  speaker1Color,
  speaker2Color,
  transcript,
  captionGroups,
  captionStyle,
  outputSettings,
  imageFitMode,
  imagePosition,
  imageScale,
  mediaType,
  durationInSeconds,
}) => {
  const { width, height, fps = 30 } = outputSettings;
  const totalFrames = Math.max(1, Math.round(durationInSeconds * fps));
  const baseBgmVol = bgMusicMuted ? 0 : Math.max(0, Math.min(1.0, bgMusicVolume ?? 0.20));

  // Dynamic BGM volume calculation per frame (Fade In, Fade Out & Speech Auto-Ducking)
  const bgmVolumeCallback = (f: number): number => {
    if (baseBgmVol <= 0) return 0;
    let vol = baseBgmVol;

    // VN-Style Fade In
    const fadeInFrames = Math.round(bgMusicFadeIn * fps);
    if (fadeInFrames > 0 && f < fadeInFrames) {
      vol = vol * (f / fadeInFrames);
    }

    // VN-Style Fade Out
    const fadeOutFrames = Math.round(bgMusicFadeOut * fps);
    if (fadeOutFrames > 0 && f > totalFrames - fadeOutFrames) {
      const remaining = Math.max(0, totalFrames - f);
      vol = vol * (remaining / fadeOutFrames);
    }

    // Smart Auto-Ducking during active speech
    if (bgMusicAutoDucking && transcript && transcript.length > 0) {
      const currentTimeSec = f / fps;
      const isSpeaking = transcript.some(
        (w) => currentTimeSec >= Math.max(0, w.start - 0.1) && currentTimeSec <= w.end + 0.15
      );
      if (isSpeaking) {
        vol = vol * 0.32;
      }
    }

    return Math.max(0, Math.min(1.0, vol));
  };

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        overflow: 'hidden',
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* 1. Background Image/Video with Fit Mode & 9 Contain Positions */}
      <BackgroundLayer
        imageSrc={imageSrc}
        fitMode={imageFitMode}
        position={imagePosition}
        scale={imageScale}
        mediaType={mediaType}
      />

      {/* 2. Synchronized Spoken Audio Track */}
      {audioSrc && (
        <Audio
          src={audioSrc}
          volume={voiceMuted ? 0 : Math.min(1.0, voiceVolume ?? 1.0)}
        />
      )}

      {/* 2b. Synchronized Background Music (BGM) Track with Fade & Auto-Ducking */}
      {bgMusicSrc && (
        <Audio
          src={bgMusicSrc}
          volume={bgmVolumeCallback}
          startFrom={Math.round(bgMusicOffset * fps)}
          loop
        />
      )}

      {/* 2c. Synchronized AI Sound Effects (SFX) Track */}
      {autoSfxEnabled !== false &&
        sfxCues &&
        sfxCues.map((cue, idx) => (
          <Sequence
            key={`sfx-${idx}-${cue.type}`}
            from={Math.max(0, Math.round(cue.time * fps))}
            durationInFrames={Math.round(1.5 * fps)}
          >
            <Audio
              src={cue.audioSrc || `/audio/sfx/${cue.type}.mp3`}
              volume={Math.max(0, Math.min(1.0, cue.volume ?? 0.7))}
            />
          </Sequence>
        ))}

      {/* 3. Deterministic GSAP Animated Typography */}
      <GsapAnimatedCaptions
        words={transcript}
        captionGroups={captionGroups}
        style={captionStyle}
        width={width}
        height={height}
        speaker1Color={speaker1Color}
        speaker2Color={speaker2Color}
      />
    </AbsoluteFill>
  );
};
