import { requireProjectAccess } from '@/lib/project-access';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProjectDirs, loadProject } from '@/lib/storage';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiverPkg = require('archiver');
const getArchiver = () => (typeof archiverPkg === 'function' ? archiverPkg : archiverPkg.default);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accessError = await requireProjectAccess(req, id);
    if (accessError) return accessError;
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const dirs = getProjectDirs(project.id);
    const zipFileName = `${project.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_clips.zip`;
    const zipFilePath = path.join(dirs.zipsDir, zipFileName);

    // Create a write stream for the zip archive
    const output = fs.createWriteStream(zipFilePath);
    const archiverFunc = getArchiver();
    const archive = archiverFunc('zip', { zlib: { level: 6 } });

    const archivePromise = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', (err: any) => reject(err));
    });

    archive.pipe(output);

    // 1. Add rendered clips
    const renderedFiles = await fs.promises.readdir(dirs.renderedDir).catch(() => []);
    for (const f of renderedFiles) {
      const fullPath = path.join(dirs.renderedDir, f);
      archive.file(fullPath, { name: `clips/${f}` });
    }

    // 2. Add SRT subtitles
    const srtFiles = await fs.promises.readdir(dirs.srtDir).catch(() => []);
    for (const f of srtFiles) {
      const fullPath = path.join(dirs.srtDir, f);
      archive.file(fullPath, { name: `subtitles/${f}` });
    }

    // 3. Add manifest JSON
    archive.append(JSON.stringify(project, null, 2), { name: 'manifest.json' });

    // 4. Add CSV manifest
    const csvRows = [
      ['ID', 'Title', 'Topic', 'Start (s)', 'End (s)', 'Duration (s)', 'Total Score', 'Meaning Score', 'Impact Score', 'Context Confidence', 'First Words', 'Last Words', 'Transcript'],
    ];

    for (const c of project.candidates) {
      csvRows.push([
        c.id,
        `"${c.title.replace(/"/g, '""')}"`,
        c.topic,
        c.start.toFixed(2),
        c.end.toFixed(2),
        c.duration.toFixed(2),
        String(c.scores.total),
        String(c.scores.meaningAndDepth),
        String(c.scores.emotionalIntellectualImpact),
        String(c.contextVerification.contextConfidence),
        `"${c.firstWords.replace(/"/g, '""')}"`,
        `"${c.lastWords.replace(/"/g, '""')}"`,
        `"${c.transcript.replace(/"/g, '""')}"`,
      ]);
    }

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    archive.append(csvContent, { name: 'manifest.csv' });

    await archive.finalize();
    await archivePromise;

    // Stream back the ZIP file
    const fileStat = await fs.promises.stat(zipFilePath);
    const fileStream = fs.createReadStream(zipFilePath);

    return new Response(fileStream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFileName}"`,
        'Content-Length': fileStat.size.toString(),
      },
    });
  } catch (err: any) {
    console.error('ZIP export error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
