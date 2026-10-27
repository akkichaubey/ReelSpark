import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaptionPreview } from '../src/components/caption-maker/CaptionPreview';
import { DEFAULT_CAPTION_STYLE, DEFAULT_OUTPUT_SETTINGS } from '../src/lib/caption-maker/sample-data';
import type {
  AnimationPreset,
  CaptionGroup,
  CaptionMode,
  CaptionStyle,
  HighlightAnimation,
  TranscriptWord,
} from '../src/lib/caption-maker/types';

const words: TranscriptWord[] = [
  { id: 'first', text: 'FIRST', start: 0.1, end: 0.3 },
  { id: 'second', text: 'SECOND', start: 0.6, end: 0.8 },
];
const group: CaptionGroup = {
  id: 'phrase',
  text: 'FIRST SECOND',
  start: 0.1,
  end: 0.9,
  words,
};

const animationPresets: AnimationPreset[] = [
  'clean', 'pop', 'kinetic', 'punch', 'minimal',
  'words-slide-up', 'words-rotate-in', 'letters-slide-up', 'letters-slide-down',
];
const highlightAnimations: HighlightAnimation[] = [
  'none', 'scale', 'pop', 'glow', 'background', 'underline', 'color-change',
];

function renderPreview(captionMode: CaptionMode, animationPreset: AnimationPreset, highlightAnimation: HighlightAnimation, currentTime: number) {
  const captionStyle: CaptionStyle = {
    ...DEFAULT_CAPTION_STYLE,
    captionMode,
    animationPreset,
    highlightAnimation,
    activeWordBgColor: '#FCD905',
    showEmojis: false,
    showSafeArea: false,
  };
  return renderToStaticMarkup(React.createElement(CaptionPreview, {
    transcript: words,
    captionGroups: [group],
    captionStyle,
    outputSettings: {
      ...DEFAULT_OUTPUT_SETTINGS,
      width: 320,
      height: 568,
      aspectRatio: '9:16',
      fps: 30,
    },
    currentTime,
    isPlaying: false,
    onTogglePlay: () => undefined,
    onSeek: () => undefined,
    totalDuration: 1,
  }));
}

function visibleText(markup: string) {
  return markup.replace(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ');
}

function run() {
  let combinations = 0;
  for (const captionMode of ['phrase-highlight', 'word-by-word'] as const) {
    for (const animationPreset of animationPresets) {
      for (const highlightAnimation of highlightAnimations) {
        const firstActive = renderPreview(captionMode, animationPreset, highlightAnimation, 0.2);
        const pause = renderPreview(captionMode, animationPreset, highlightAnimation, 0.4);
        const secondActive = renderPreview(captionMode, animationPreset, highlightAnimation, 0.7);
        const firstText = visibleText(firstActive);
        const pauseText = visibleText(pause);
        const secondText = visibleText(secondActive);

        if (captionMode === 'phrase-highlight') {
          assert.match(firstText, /FIRST.*SECOND/, `${animationPreset}/${highlightAnimation}: phrase visible while first word is spoken`);
          assert.match(pauseText, /FIRST.*SECOND/, `${animationPreset}/${highlightAnimation}: phrase remains visible during a natural pause`);
          assert.match(secondText, /FIRST.*SECOND/, `${animationPreset}/${highlightAnimation}: phrase visible while second word is spoken`);
        } else {
          assert.match(firstText, /FIRST/, `${animationPreset}/${highlightAnimation}: first solo word is visible`);
          assert.doesNotMatch(firstText, /SECOND/, `${animationPreset}/${highlightAnimation}: future solo word is not early`);
          assert.doesNotMatch(pauseText, /FIRST|SECOND/, `${animationPreset}/${highlightAnimation}: no stale solo word during pause`);
          assert.match(secondText, /SECOND/, `${animationPreset}/${highlightAnimation}: second solo word is visible at its timestamp`);
          assert.doesNotMatch(secondText, /FIRST/, `${animationPreset}/${highlightAnimation}: previous solo word does not linger`);
        }

        if (highlightAnimation === 'background') {
          assert.match(firstActive, /background-color:rgba\(\s*252,\s*217,\s*5,\s*(?!0(?:\.0+)?\))/i, `${captionMode}/${animationPreset}: active word gets a visible pill`);
          assert.doesNotMatch(pause, /background-color:/i, `${captionMode}/${animationPreset}: no stale pill during pause`);
          assert.match(secondActive, /background-color:rgba\(\s*252,\s*217,\s*5,\s*(?!0(?:\.0+)?\))/i, `${captionMode}/${animationPreset}: next word pill starts at its timestamp`);
        }

        combinations += 1;
      }
    }
  }

  assert.equal(combinations, 126);
  console.log('✓ Caption preview QA passed: 9 motion presets × 7 highlight effects × 2 caption modes.');
  console.log('✓ Phrase captions persist across silence without a stale active-word pill; solo-word captions do not leak across gaps.');
}

run();
