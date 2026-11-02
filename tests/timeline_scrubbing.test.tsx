import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hoverSeekTime } from '../src/lib/timeline/pointer';
import { ProfessionalTimeline } from '../src/components/caption-maker/ProfessionalTimeline';
import { createEmptyCaptionProject } from '../src/lib/caption-maker/sample-data';
import { deleteTimelineTrack, timelineFromProject } from '../src/lib/timeline/model';

const pointer={enabled:true,playing:false,dragging:false,pointerType:'mouse',buttons:0,clientX:360,canvasLeft:160,pixelsPerSecond:40,durationMs:42000,fps:30};
assert.equal(hoverSeekTime(pointer),5);
assert.equal(hoverSeekTime({...pointer,canvasLeft:-240}),15,'Horizontal scrolling must use the canvas origin');
assert.equal(hoverSeekTime({...pointer,clientX:0}),0);
assert.ok(hoverSeekTime({...pointer,clientX:999999})!<42,'Clamp before the end frame');
for(const state of [{enabled:false},{playing:true},{dragging:true},{buttons:1},{pointerType:'touch'}]) assert.equal(hoverSeekTime({...pointer,...state}),null);

const project=createEmptyCaptionProject();
project.image={id:'portrait',fileUrl:'/api/files/portrait.jpg',fileName:'portrait.jpg',mediaType:'image',fitMode:'contain',width:500,height:900,fileSize:1,format:'jpg',duration:42};
const timeline=timelineFromProject(project); timeline.clips[0].durationMs=42000;project.timeline={...timeline,enabled:true};
const noop=()=>undefined;
const html=renderToStaticMarkup(<ProfessionalTimeline project={project} currentTime={0} isPlaying={false} onSeek={noop} onTogglePlay={noop} onChange={noop} onUndo={noop} onRedo={noop} canUndo={false} canRedo={false} onEditCaptions={noop} onTrimChange={noop} onOpenSmartEditor={noop}/>);
assert.ok(html.includes('background-size:auto 100%'));
assert.ok(html.includes('background-repeat:repeat-x'));
assert.ok(!html.includes('<img'),'A long still-image strip must repeat its natural aspect, not stretch a single image');
assert.ok(html.includes('Hover scrub'));
assert.ok(html.includes('aria-label="Timeline playhead"'));
console.log('PASS: hover controls, scrolling, frame bounds, playback/drag/touch guards, draggable playhead, and long portrait filmstrip aspect ratio.');

assert.ok(html.includes('aria-label="Delete track: Main video"'));
const linked = timelineFromProject({...project,timeline:undefined,audio:{id:'voice',fileUrl:'/api/files/voice.wav',fileName:'voice.wav',duration:42,fileSize:1,format:'wav'},transcript:[{id:'word',text:'Preserve',start:0,end:1}]});
const before = JSON.stringify(linked);
const removed = deleteTimelineTrack(linked,'track_captions');
assert.equal(removed.tracks.length,linked.tracks.length-1);
assert.ok(removed.clips.some(clip=>clip.trackId==='track_voice'));
assert.ok(!removed.clips.find(clip=>clip.trackId==='track_voice')!.linkId);
assert.deepEqual(removed.assets,linked.assets);
assert.equal(JSON.stringify(linked),before,'Deleting is immutable, so the undo snapshot remains complete');
assert.throws(()=>deleteTimelineTrack({...linked,tracks:linked.tracks.map(track=>track.id==='track_video'?{...track,locked:true}:track)},'track_video'),/Unlock/);
assert.ok(!deleteTimelineTrack(linked,'track_video').clips.some(clip=>clip.trackId==='track_video'));
console.log('PASS: track delete icon, populated track deletion, linked clips/source retention, undo snapshot and locked-track guard.');
