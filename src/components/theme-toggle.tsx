'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle({ expanded = false, className = '' }: { expanded?: boolean; className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="appearance" type="button" aria-label="Toggle light and dark mode" aria-pressed={resolvedTheme === 'light'} title="Toggle light and dark mode"
      onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
      onKeyDown={event => event.stopPropagation()}
      className={className}>
      <Sun aria-hidden="true" className="theme-light-icon h-4 w-4 shrink-0" />
      <Moon aria-hidden="true" className="theme-dark-icon h-4 w-4 shrink-0" />
      {expanded && <span className="truncate">Appearance</span>}
    </Button>
  );
}
