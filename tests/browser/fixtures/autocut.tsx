import React from 'react';
import { createRoot } from 'react-dom/client';
import { AutoCutStudio } from '../../../src/components/clipping-studio/AutoCutStudio';
import { useClippingStore } from '../../../src/lib/clipping-studio/use-clipping-store';
const asset = { id: 'asset_qa', projectId: 'qa_project', localPath: 'D:/app/storage/clipping-studio/projects/qa_project/media/source.mp4', filename: 'source.mp4', fileSizeBytes: 1,
  metadata: { durationMs: 60000, durationSeconds: 60, sizeBytes: 1, formatName: 'mp4', aspectRatio: '4:3', width: 320, height: 240, fps: 25, hasVideo: true, hasAudio: true }, createdAt: new Date().toISOString() };
const project = { id: 'qa_project', name: 'QA source', mediaAssets: [asset], clips: [], mergeRecipes: [], exportJobs: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
useClippingStore.setState({ activeProject: project, selectedAssetId: asset.id, projects: [project] });
function Fixture() {
  const state = useClippingStore();
  return <main><h1>Auto Cut QA</h1><button onClick={() => useClippingStore.setState({ selectedAssetId: 'second', activeProject: { ...project, mediaAssets: [{ ...asset, id: 'second' }] } })}>Switch source</button><output data-testid="clip-count">{state.activeProject?.clips.length}</output><AutoCutStudio /></main>;
}
createRoot(document.getElementById('qa-root')!).render(<Fixture />);
