import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeTrimRange, musicTime } from '../src/lib/caption-maker/playback-time';
import { nudgeWordTiming, shiftWordTiming, snapWordToTime } from '../src/lib/caption-maker/timing-adjuster';
import { updateCaptionGroupPhrase } from '../src/lib/caption-maker/caption-grouping';
import { CaptionTimeline } from '../src/components/caption-maker/CaptionTimeline';
import { TranscriptEditor } from '../src/components/caption-maker/TranscriptEditor';
import type { CaptionGroup } from '../src/lib/caption-maker/types';

assert.deepEqual(normalizeTrimRange(0.12, { start: 0, end: 0.12 }), { start: 0, end: 0.12 });
assert.deepEqual(normalizeTrimRange(10, { start: 12, end: 3 }), { start: 2.5, end: 3 });
assert.deepEqual(normalizeTrimRange(Infinity), { start: 0, end: 0 });
assert.deepEqual(normalizeTrimRange(10, { start: NaN, end: Infinity }), { start: 0, end: 10 });
assert.equal(musicTime(3, 2, 4), 1);
assert.equal(musicTime(0, -1, 4), 3);
assert.equal(musicTime(3, 2, Infinity), 0);
assert.equal(musicTime(3, 2, NaN), 0);
console.log('PASS: short/invalid/restored trim bounds and finite wrapped music source clock');

const groups: CaptionGroup[] = [{id:'g',text:'A B C',start:1,end:4,words:[
  {id:'a',text:'A',start:1,end:1.2},
  {id:'b',text:'B',start:2,end:2.1},
  {id:'c',text:'C',start:3,end:4},
]}];
for (const edited of [nudgeWordTiming(groups,'b',-2,0), shiftWordTiming(groups,'b',-2), snapWordToTime(groups,'b',0)]) {
  assert.equal(edited[0].start,0,'A middle word moved earlier must remain inside the visible phrase');
  assert.equal(edited[0].end,4);
}
assert.equal(nudgeWordTiming(groups,'b',0,5)[0].end,7.1,'A middle word extended later must remain visible');
for(const text of ['Hello world again','नमस्ते दुनिया फिर','Zindagi mein jeet']) {
  const edited=updateCaptionGroupPhrase(groups,'g',text,1,4)[0];
  assert.deepEqual(edited.words.map(w=>[w.start,w.end]),groups[0].words.map(w=>[w.start,w.end]));
}
assert.equal(groups[0].words[1].start,2,'Changes are immutable for undo');
console.log('PASS: nudge/shift/snap phrase envelopes; English/Hindi/Hinglish spelling edits preserve exact alignment and pauses');

const noop=()=>{};
const props={duration:0,currentTime:0,isPlaying:false,groups:[],onSeek:noop,onTogglePlay:noop};
const empty=renderToStaticMarkup(<CaptionTimeline {...props}/>);
assert.ok(!empty.includes('NaN') && !empty.includes('Infinity'));
assert.ok(!empty.includes('height:15%'),'No decorative waveform');
const silent=renderToStaticMarkup(<CaptionTimeline {...props} duration={1} waveformPeaks={[0,0]}/>);
assert.ok(silent.includes('height:0%'),'Analyzed silence must stay flat');
const peaks=renderToStaticMarkup(<CaptionTimeline {...props} duration={1} waveformPeaks={[0.25,1]}/>);
assert.ok(peaks.includes('height:25%') && peaks.includes('height:100%'));
const adjacent=[...groups,{...groups[0],id:'g2',start:4,end:5}];
const transcript=renderToStaticMarkup(<TranscriptEditor groups={adjacent} currentTime={4} onUpdateGroups={noop} onSeek={noop}/>);
assert.equal((transcript.match(/ring-amber-500\/20/g)||[]).length,1,'Exact phrase end is exclusive');
console.log('PASS: rendered empty ruler, genuine peaks/silence, exclusive transcript boundaries');
