import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo } from 'remotion';
import { ImageFitMode, ImagePosition } from '../lib/caption-maker/types';

interface BackgroundLayerProps {
  imageSrc?: string;
  fitMode?: ImageFitMode;
  position?: ImagePosition;
  scale?: number;
  mediaType?: 'image' | 'video';
  muted?: boolean;
}

export const posAlignment: Record<ImagePosition, { justifyContent: string; alignItems: string }> = {
  'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start' },
  'top-center': { justifyContent: 'center', alignItems: 'flex-start' },
  'top-right': { justifyContent: 'flex-end', alignItems: 'flex-start' },
  'center-left': { justifyContent: 'flex-start', alignItems: 'center' },
  'center': { justifyContent: 'center', alignItems: 'center' },
  'center-right': { justifyContent: 'flex-end', alignItems: 'center' },
  'bottom-left': { justifyContent: 'flex-start', alignItems: 'flex-end' },
  'bottom-center': { justifyContent: 'center', alignItems: 'flex-end' },
  'bottom-right': { justifyContent: 'flex-end', alignItems: 'flex-end' },
};

export function getCssObjectPosition(position?: ImagePosition): string {
  switch (position) {
    case 'top-left':
      return 'left top';
    case 'top-center':
      return 'center top';
    case 'top-right':
      return 'right top';
    case 'center-left':
      return 'left center';
    case 'center':
      return 'center center';
    case 'center-right':
      return 'right center';
    case 'bottom-left':
      return 'left bottom';
    case 'bottom-center':
      return 'center bottom';
    case 'bottom-right':
      return 'right bottom';
    default:
      return 'left bottom';
  }
}

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  imageSrc,
  fitMode = 'cover',
  position = 'center',
  scale = 100,
  mediaType,
  muted = false,
}) => {
  if (!imageSrc) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: '#09090b',
        }}
      />
    );
  }

  const isVideo =
    mediaType === 'video' ||
    Boolean(
      imageSrc &&
        (imageSrc.startsWith('data:video/') ||
          /\.(mp4|webm|mov|mkv|avi)($|\?)/i.test(imageSrc) ||
          imageSrc.includes('type=video'))
    );

  const align = posAlignment[position || 'center'];

  if (fitMode === 'blur') {
    const Media = isVideo ? OffthreadVideo : Img;
    return (
      <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
        <Media
          {...(isVideo ? { muted } : {})}
          src={imageSrc}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px)', transform: 'scale(1.08)' }}
        />
        <Media
          {...(isVideo ? { muted } : {})}
          src={imageSrc}
          style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </AbsoluteFill>
    );
  }

  if ((fitMode || 'cover') === 'contain') {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: '#000000',
          display: 'flex',
          justifyContent: align.justifyContent,
          alignItems: align.alignItems,
          padding: 24,
          overflow: 'hidden',
        }}
      >
        {isVideo ? (
          <OffthreadVideo
            muted={muted}
            src={imageSrc}
            style={{
              maxWidth: `${scale}%`,
              maxHeight: `${scale}%`,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        ) : (
          <Img
            src={imageSrc}
            style={{
              maxWidth: `${scale}%`,
              maxHeight: `${scale}%`,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        )}
      </AbsoluteFill>
    );
  }

  // Default: 'cover'
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        overflow: 'hidden',
      }}
    >
      {isVideo ? (
        <OffthreadVideo
          muted={muted}
          src={imageSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <Img
          src={imageSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
          }}
        />
      )}
    </AbsoluteFill>
  );
};
