import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SmartEditorModal } from '../../../src/components/caption-maker/SmartEditorModal';
import { ThumbnailCreatorModal } from '../../../src/components/caption-maker/ThumbnailCreatorModal';
import { createEmptyCaptionProject } from '../../../src/lib/caption-maker/sample-data';
const words = [{ id: 'first', text: 'Hello', start: 0, end: 0.4 }, { id: 'filler', text: 'um', start: 1.4, end: 1.6 }, { id: 'last', text: 'world', start: 2.6, end: 3 }];
function Fixture() {
  const [dialog, setDialog] = useState<'smart' | 'thumbnail' | null>(null);
  const [project, setProject] = useState(() => ({ ...createEmptyCaptionProject('state_qa'), image: { id: 'image', fileUrl: '/qa-red.png', fileName: 'source.png', fileSize: 1, width: 10, height: 10, format: 'PNG', fitMode: 'cover' as const, position: 'center' as const, scale: 100 } }));
  useEffect(() => {
    const replace = () => setProject(p=>({ ...p, image: { ...p.image!, fileUrl: '/qa-blue.png' } }));
    const landscape = () => setProject(p=>({ ...p, outputSettings: { ...p.outputSettings, preset: 'youtube-landscape' } }));
    window.addEventListener('qa-replace-background', replace); window.addEventListener('qa-landscape', landscape);
    return () => { window.removeEventListener('qa-replace-background', replace); window.removeEventListener('qa-landscape', landscape); };
  }, []);
  return <main><h1>Editor state QA</h1><button onClick={()=>setDialog('smart')}>Open smart editor</button><button onClick={()=>setDialog('thumbnail')}>Open thumbnail editor</button>
    <SmartEditorModal isOpen={dialog==='smart'} onClose={()=>setDialog(null)} words={words} captionGroups={[]} totalDuration={3} audio={{ id: 'audio', fileUrl: '/qa.wav', fileName: 'qa.wav', fileSize: 1, duration: 3, format: 'WAV' }} />
    <ThumbnailCreatorModal isOpen={dialog==='thumbnail'} onClose={()=>setDialog(null)} project={project} />
  </main>;
}
createRoot(document.getElementById('qa-root')!).render(<Fixture />);
