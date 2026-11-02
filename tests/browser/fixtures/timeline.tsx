import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProfessionalTimeline } from '@/components/caption-maker/ProfessionalTimeline';
import { TimelinePreview } from '@/components/caption-maker/TimelinePreview';
import { createEmptyCaptionProject } from '@/lib/caption-maker/sample-data';
import { createTimelineClip, timelineFromProject, commitTimeline } from '@/lib/timeline/model';
import type { CaptionProject } from '@/lib/caption-maker/types';
import { updateCaptionSource } from '@/lib/timeline/caption-edits';
import { Button } from '@/components/ui/button';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

function initial(): CaptionProject {
  const project = createEmptyCaptionProject('QA fixture only');
  project.audio = { id: 'voice_fixture', fileUrl: '/api/files/qa-ui/source.mp4', fileName: 'QA voice.mp4', duration: 4, fileSize: 1000, format: 'mp4' };
  project.image = { id: 'visual_fixture', fileUrl: '/api/files/qa-ui/source.mp4', fileName: 'QA video.mp4', duration: 4, fileSize: 1000, format: 'mp4', width: 320, height: 180, fitMode: 'contain', mediaType: 'video' };
  project.transcript = [{ id: 'word_1', text: 'Hello', start: 0.3, end: 0.8, timingSource: 'model-word-level' }, { id: 'word_2', text: 'world', start: 1.2, end: 1.8, timingSource: 'model-word-level' }, { id: 'word_3', text: 'नमस्ते', start: 2.4, end: 3.2, timingSource: 'model-word-level' }];
  project.captionGroups = [{ id: 'phrase_1', start: 0.3, end: 3.2, text: 'Hello world नमस्ते', words: project.transcript }];
  project.captionStyle = { ...project.captionStyle, fontFamily: 'Arial' };
  project.outputSettings = { ...project.outputSettings, width: 240, height: 426, fps: 25 };
  const timeline = timelineFromProject(project);
  const videoTrack = timeline.tracks.find(t => t.kind === 'video')!;
  timeline.clips.push({ ...createTimelineClip(videoTrack, timeline.assets.find(a => a.id === 'visual_fixture'), 5000, 1000), name: 'Later video' });
  project.timeline = commitTimeline(timeline);
  return project;
}
function TimelineFixture() {
  const [history, setHistory] = useState<CaptionProject[]>(() => [initial()]);
  const [index, setIndex] = useState(0), [time, setTime] = useState(1.5), [playing, setPlaying] = useState(false), [seekVersion, setSeekVersion] = useState(0), [message, setMessage] = useState('');
  const project = history[index];
  const save = (next: CaptionProject) => { setHistory([...history.slice(0, index + 1), next]); setIndex(index + 1); };
  const seek = (next: number) => { setTime(next); setSeekVersion(v => v + 1); };
  return <ThemeProvider><main className="flex min-h-screen flex-col bg-zinc-950 text-zinc-200">
    <div className="flex items-center gap-3 p-3"><h1 className="text-base font-bold">Isolated timeline QA</h1><ThemeToggle /><output data-testid="message">{message}</output></div>
    <div className="h-72 w-40 self-center"><TimelinePreview project={project} currentTime={time} playing={playing} onTime={setTime} onPlaying={setPlaying} seekVersion={seekVersion} /></div>
    <output hidden data-testid="project-state">{JSON.stringify(project)}</output><output hidden data-testid="clock">{time}</output>
    <div className="flex gap-2 p-2"><Button type="button" onClick={() => { localStorage.setItem('qa-only-project', JSON.stringify(project)); setMessage('Saved QA copy'); }}>Save QA copy</Button>
      <Button type="button" onClick={() => { const stored = localStorage.getItem('qa-only-project'); if (stored) { save(JSON.parse(stored)); setMessage('Reopened QA copy'); } }}>Reopen QA copy</Button></div>
    <ProfessionalTimeline project={project} currentTime={time} isPlaying={playing} onSeek={seek} onTogglePlay={() => setPlaying(p => !p)}
      onChange={timeline => save({ ...project, timeline })} onUndo={() => { setIndex(i => Math.max(0, i - 1)); setPlaying(false); }} onRedo={() => setIndex(i => Math.min(history.length - 1, i + 1))}
      canUndo={index > 0} canRedo={index < history.length - 1} onTrimChange={() => {}} onOpenSmartEditor={() => setMessage('Smart editor requested')}
      onEditCaptions={() => setMessage('Transcript requested')} onCaptionEffects={() => setMessage('Caption effects requested')}
      onAutoSyncCaptions={() => setMessage('Mock sync callback requested')}
      onCaptionSourceChange={(assetId, groups) => save(updateCaptionSource(project, assetId, groups))} />
  </main></ThemeProvider>;
}
createRoot(document.getElementById('qa-root')!).render(<React.StrictMode><TimelineFixture /></React.StrictMode>);
