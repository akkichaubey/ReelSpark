import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DialogSurface, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

function Choice({ label, action = false }: { label: string; action?: boolean }) {
  const [value, setValue] = useState(''), [count, setCount] = useState(0);
  return <div className="space-y-2"><Select value={action ? '' : value} onValueChange={v => { setValue(v); setCount(n => n + 1); }}>
    <SelectTrigger aria-label={label}><SelectValue placeholder="Choose track" /></SelectTrigger>
    <SelectContent><SelectItem value="video">Video</SelectItem><SelectItem value="audio">Audio</SelectItem><SelectItem value="text" disabled>Unavailable</SelectItem></SelectContent>
  </Select><output data-testid={label}>{value} · {count}</output></div>;
}
function UI() {
  const [open, setOpen] = useState(false), [submitted, setSubmitted] = useState('');
  return <ThemeProvider><main className="space-y-6 p-6"><h1 className="text-xl font-bold">ReelSpark component QA</h1><ThemeToggle />
    <div className="flex flex-wrap gap-3">{(['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const).map(variant => <Button key={variant} variant={variant} size="default" type="button">{variant} action</Button>)}
      <Button variant="default" size="default" disabled>Disabled action</Button></div>
    <form aria-label="QA form" className="max-w-md space-y-3" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); setSubmitted(`${data.get('email')}|${data.get('caption')}`); }}>
      <label className="block">Email<Input type="email" name="email" required className="block w-full rounded border border-zinc-700 bg-zinc-900 p-2" /></label>
      <label className="block">Caption<Textarea name="caption" className="block w-full rounded border border-zinc-700 bg-zinc-900 p-2" /></label>
      <label className="block">Disabled field<Input disabled defaultValue="fixed" /></label>
      <Button variant="default" size="default" type="submit">Submit QA form</Button><output data-testid="submitted">{submitted}</output>
    </form>
    <Choice label="Track type" /><Choice label="Add track repeatedly" action />
    <Select disabled><SelectTrigger aria-label="Disabled select"><SelectValue placeholder="Disabled" /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem></SelectContent></Select>
    <Button variant="outline" size="default" onClick={() => setOpen(true)}>Open QA dialog</Button>
    {open && <DialogSurface onClose={() => setOpen(false)} overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" className="w-full max-w-md space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6">
      <DialogTitle asChild><h2 className="text-lg font-bold">QA dialog</h2></DialogTitle><DialogDescription>Focus and nested selection test.</DialogDescription>
      <label className="block">Dialog field<Input className="block rounded border border-zinc-700 bg-zinc-950 p-2" /></label><Choice label="Dialog options" />
      <Button variant="secondary" size="default" onClick={() => setOpen(false)}>Close QA dialog</Button>
    </DialogSurface>}
  </main></ThemeProvider>;
}
createRoot(document.getElementById('qa-root')!).render(<React.StrictMode><UI /></React.StrictMode>);
