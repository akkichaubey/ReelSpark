import type { Metadata } from 'next';
import { MediaErrorHandler } from '@/components/MediaErrorHandler';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReelSpark — Local Video to Reels & Shorts Studio',
  description:
    'Identify and render the best short viral and philosophical clips under 60 seconds from long speeches, podcasts, and interviews with synchronized subtitles and local FFmpeg processing.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  keywords: [
    'ReelSpark',
    'Reels Studio',
    'Osho Speeches',
    'Video to Shorts',
    'FFmpeg Clip Maker',
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
        {children}
      </body>
    </html>
  );
}
