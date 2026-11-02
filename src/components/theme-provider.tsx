'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/** Application chrome only: media output scopes retain their own palette. */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" themes={['dark', 'light']}
      storageKey="reelspark-theme" enableSystem={false}
      scriptProps={{ type: typeof window === 'undefined' ? 'text/javascript' : 'text/plain' }} {...props}>
      {children}
    </NextThemesProvider>
  );
}
