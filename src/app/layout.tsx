import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Clip Finder — Local Video to Reels & Shorts Studio',
  description:
    'Identify and render the best short viral and philosophical clips under 60 seconds from long speeches, podcasts, and interviews with synchronized subtitles and local FFmpeg processing.',
  keywords: [
    'AI Clip Finder',
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
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
