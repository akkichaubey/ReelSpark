import React from 'react';
import { Composition } from 'remotion';
import { CaptionReel } from './CaptionReel';
import { RemotionCaptionProps } from './types';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from '../lib/caption-maker/sample-data';

export function calculateCompositionMetadata(options: { props: RemotionCaptionProps; [key: string]: any }) {
  const fps = options.props.outputSettings?.fps || 30;
  const duration = options.props.durationInSeconds || 10;
  return {
    fps,
    durationInFrames: Math.max(1, Math.round(duration * fps)),
    width: options.props.outputSettings?.width || 1080,
    height: options.props.outputSettings?.height || 1920,
  };
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition<any, RemotionCaptionProps>
      id="CaptionReel"
      component={CaptionReel}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        transcript: [],
        captionGroups: [],
        captionStyle: DEFAULT_CAPTION_STYLE,
        outputSettings: DEFAULT_OUTPUT_SETTINGS,
        durationInSeconds: 10,
      }}
      calculateMetadata={calculateCompositionMetadata}
    />
  );
};
