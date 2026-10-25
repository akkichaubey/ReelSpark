import type { Metadata } from 'next';
import { MediaErrorHandler } from '@/components/MediaErrorHandler';
import { AccountWorkspaceBoundary } from '@/components/AccountWorkspaceBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReelMaker — Video to Reels & Shorts Studio',
  description:
    'Find engaging moments in long videos, create short reels with synchronized captions, and prepare social-ready video covers.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  keywords: [
    'ReelMaker',
    'Reels Studio',
    'Osho Speeches',
    'Video to Shorts',
    'Subtitles Generator',
    'Speech to Text',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <MediaErrorHandler />
        <AccountWorkspaceBoundary>{children}</AccountWorkspaceBoundary>
      </body>
    </html>
  );
}
