import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { BackgroundLayer } from './BackgroundLayer';
import { GsapAnimatedCaptions } from './GsapAnimatedCaptions';
import { RemotionCaptionProps } from './types';

export const CaptionReel: React.FC<RemotionCaptionProps> = ({
  imageSrc,
  audioSrc,
  transcript,
  captionGroups,
  captionStyle,
  outputSettings,
  imageFitMode,
  imagePosition,
  imageScale,
  mediaType,
}) => {
  const { width, height } = outputSettings;

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

      {/* 2. Synchronized Audio Track */}
      {audioSrc && <Audio src={audioSrc} />}

      {/* 3. Deterministic GSAP Animated Typography */}
      <GsapAnimatedCaptions
        words={transcript}
        captionGroups={captionGroups}
        style={captionStyle}
        width={width}
        height={height}
      />
    </AbsoluteFill>
  );
};
