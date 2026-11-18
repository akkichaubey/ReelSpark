import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { getRequestUser, isSameOriginAuthRequest } from '@/lib/auth';
import { APP_CONFIG } from '@/lib/config';
import { assertSafePath, resolveStoragePath } from '@/lib/storage';
import { canReadMedia } from '@/lib/media-access';
import { deletePrivateMedia, privateMediaEnabled } from '@/lib/cloudflare/private-media';
import { d1Query } from '@/lib/cloudflare/d1';
import { isStoragePathActive } from '@/lib/storage-runtime';
import type { TimelineAsset } from '@/lib/timeline/model';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });

  try {
    const captionMakerDir = path.join(APP_CONFIG.storageRoot, 'caption-maker');
    const assets: TimelineAsset[] = [];
    const seenUrls = new Set<string>();
    const seenContent = new Set<string>();
    const seenIds = new Set<string>();

    const getUniqueId = (baseId: string): string => {
      let id = baseId;
      let counter = 1;
      while (seenIds.has(id)) {
        id = `${baseId}_${counter++}`;
      }
      seenIds.add(id);
      return id;
    };

    if (fsSync.existsSync(captionMakerDir)) {
      const entries = await fs.readdir(captionMakerDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('asset_') || entry.name.startsWith('asset_preview_')) {
          continue;
        }

        const assetDir = path.join(captionMakerDir, entry.name);
        const ownerFile = path.join(assetDir, '.owner.json');
        try {
          const ownerRaw = await fs.readFile(ownerFile, 'utf8');
          const owner = JSON.parse(ownerRaw);
          if (owner.userId !== user.id && user.role !== 'admin' && user.id !== 'usr_admin') continue;
        } catch {
          // If unreadable or missing owner: claim legacy asset for active user so it can be managed
          if (user.id !== 'usr_admin') {
            try {
              await fs.writeFile(ownerFile, JSON.stringify({ userId: user.id }), 'utf8');
            } catch {}
          }
        }

        // Try reading cached .meta.json
        const metaFile = path.join(assetDir, '.meta.json');
        let meta: any = null;
        try {
          meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
        } catch {}

        if (meta && meta.fileUrl && !seenUrls.has(meta.fileUrl)) {
          const fileName = meta.fileName || 'Media Asset';
          const ext = path.extname(fileName).toLowerCase();
          const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.avif'].includes(ext);
          const isVideo = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext);
          const isAudio = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext);
          if (!isImage && !isVideo && !isAudio) continue;

          let fileSize = meta.fileSize || meta.size || 0;
          if (!fileSize) {
            try {
              const localPath = path.join(assetDir, path.basename(meta.fileUrl));
              fileSize = (await fs.stat(localPath)).size;
            } catch {}
          }
          const contentKey = `${fileName.toLowerCase()}_${fileSize}`;
          if (fileSize > 0 && seenContent.has(contentKey)) continue;
          if (fileSize > 0) seenContent.add(contentKey);

          seenUrls.add(meta.fileUrl);
          const assetId = getUniqueId(meta.id || entry.name);
          assets.push({
            id: assetId,
            fileName,
            fileUrl: meta.fileUrl,
            mediaType: meta.mediaType || (isImage ? 'image' : isVideo ? 'video' : 'audio'),
            durationMs: Math.round((meta.duration || 3) * 1000),
            width: meta.width || 1080,
            height: meta.height || 1920,
            fitMode: 'cover',
            position: 'center',
            scale: 100,
            hasAudio: meta.mediaType !== 'image',
            isFavorite: Boolean(meta.isFavorite),
          });
          continue;
        }

        // Fallback for directories without .meta.json: inspect directory files
        try {
          const files = await fs.readdir(assetDir, { withFileTypes: true });
          const mediaFiles = files.filter(f => f.isFile() && !f.name.startsWith('.'));
          const hasVideoFile = mediaFiles.some(f => ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(path.extname(f.name).toLowerCase()));
          for (const file of mediaFiles) {
            const ext = path.extname(file.name).toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.avif'].includes(ext);
            const isVideo = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext);
            const isAudio = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext);

            if (!isImage && !isVideo && !isAudio) continue;

            // Ignore internal extracted audio companions of video files (e.g. video_audio.mp3, video.mp4.audio.mp3)
            if (isAudio && hasVideoFile && (file.name.includes('_audio.') || file.name.includes('.audio.'))) {
              continue;
            }

            const fullPath = path.join(assetDir, file.name);
            let fileSize = 0;
            try {
              const stat = await fs.stat(fullPath);
              fileSize = stat.size;
            } catch {}

            const contentKey = `${file.name.toLowerCase()}_${fileSize}`;
            if (fileSize > 0 && seenContent.has(contentKey)) continue;
            if (fileSize > 0) seenContent.add(contentKey);

            const fileUrl = `/api/files/caption-maker/${entry.name}/${file.name}`;
            if (seenUrls.has(fileUrl)) continue;
            seenUrls.add(fileUrl);

            const mediaType = isImage ? 'image' : isVideo ? 'video' : 'audio';
            const assetId = getUniqueId(entry.name);

            assets.push({
              id: assetId,
              fileName: file.name,
              fileUrl,
              mediaType,
              durationMs: isImage ? 3000 : 0,
              width: 1080,
              height: 1920,
              fitMode: 'cover',
              position: 'center',
              scale: 100,
              hasAudio: mediaType !== 'image',
              isFavorite: false,
            });
          }
        } catch {}
      }
    }

    // Cloudflare D1 query for cloud-backed private media if enabled
    if (privateMediaEnabled()) {
      try {
        const cloudResult = await d1Query<{ relative_path: string; size_bytes: number; updated_at: string }>(
          `SELECT relative_path, size_bytes, updated_at FROM private_media WHERE owner_user_id = ? AND relative_path LIKE 'caption-maker/asset_%'`,
          [user.id]
        );
        if (cloudResult.success && cloudResult.results) {
          for (const row of cloudResult.results) {
            const fileName = path.basename(row.relative_path);

            // Skip internal extracted audio siblings or sync metadata
            if (fileName.includes('_audio.') || fileName.includes('.audio.') || fileName.endsWith('.sync.json')) {
              continue;
            }

            const contentKey = `${fileName.toLowerCase()}_${row.size_bytes}`;
            if (row.size_bytes > 0 && seenContent.has(contentKey)) continue;
            if (row.size_bytes > 0) seenContent.add(contentKey);

            const fileUrl = `/api/files/${row.relative_path}`;
            if (seenUrls.has(fileUrl)) continue;
            seenUrls.add(fileUrl);

            const ext = path.extname(row.relative_path).toLowerCase();
            const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.avif'].includes(ext);
            const isVideo = ['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext);
            const mediaType = isImage ? 'image' : isVideo ? 'video' : 'audio';

            const parts = row.relative_path.split('/');
            const rawAssetId = parts.length >= 2 ? parts[1] : `asset_${fileName}`;
            const assetId = getUniqueId(rawAssetId);

            assets.push({
              id: assetId,
              fileName,
              fileUrl,
              mediaType,
              durationMs: isImage ? 3000 : 0,
              width: 1080,
              height: 1920,
              fitMode: 'cover',
              position: 'center',
              scale: 100,
              hasAudio: mediaType !== 'image',
              isFavorite: false,
            });
          }
        }
      } catch (err) {
        console.warn('[List user media library] Cloud private media query notice:', err);
      }
    }

    return NextResponse.json({ success: true, assets });
  } catch (error) {
    console.error('[List user media library]', error);
    return NextResponse.json({ error: 'Failed to retrieve media library' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    const body = await req.json();
    if (typeof body.fileUrl !== 'string' || !body.fileUrl.startsWith('/api/files/') || /[?#]/.test(body.fileUrl))
      return NextResponse.json({ error: 'Only uploaded media can be permanently deleted.' }, { status: 400 });
    const relative = decodeURIComponent(body.fileUrl.slice(11));
    if (relative.split(/[\\/]/).some(part => !part || part.startsWith('.')))
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 });
    if (!/\.(mp4|mov|webm|mkv|mp3|wav|m4a|aac|ogg|flac|png|jpe?g|webp|gif|avif)$/i.test(relative))
      return NextResponse.json({ error: 'Only media files can be deleted.' }, { status: 400 });
    const filename = resolveStoragePath(relative);
    const isAdmin = user.role === 'admin' || user.id === 'usr_admin';
    if (!isAdmin && !(await canReadMedia(user.id, filename))) {
      // Auto-claim legacy unowned asset folder if owner file is missing
      const safeFilename = path.resolve(filename);
      const assetDir = path.dirname(safeFilename);
      const ownerFile = path.join(assetDir, '.owner.json');
      let claimed = false;
      if (!fsSync.existsSync(ownerFile)) {
        try {
          await fs.writeFile(ownerFile, JSON.stringify({ userId: user.id }), 'utf8');
          claimed = await canReadMedia(user.id, filename);
        } catch {}
      }
      if (!claimed) {
        return NextResponse.json({ error: 'Media unavailable or not owned by this account.' }, { status: 403 });
      }
    }
    const root = await fs.realpath(APP_CONFIG.storageRoot);
    const realFile = assertSafePath(await fs.realpath(filename), root);
    const parts = path.relative(root, realFile).split(path.sep);
    const directory = path.dirname(realFile);
    // A caption upload owns its original and any extracted audio siblings.
    const upload = parts.length === 3 && parts[0] === 'caption-maker' && /^asset_[a-zA-Z0-9_-]+$/.test(parts[1]) && !parts[1].startsWith('asset_preview_');
    const files = upload
      ? (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && !entry.name.startsWith('.')).map(entry => path.join(directory, entry.name))
      : [realFile];
    if (files.some(file => isStoragePathActive(file)) || isStoragePathActive(directory))
      return NextResponse.json({ error: 'This media is currently processing. Try again when processing finishes.' }, { status: 409 });
    for (const file of files) {
      if (!isAdmin && !(await canReadMedia(user.id, file))) return NextResponse.json({ error: 'Media ownership check failed.' }, { status: 403 });
    }
    // Remove registered backups first so a later request cannot restore deleted bytes.
    for (const file of files) {
      try {
        await deletePrivateMedia(user.id, file);
      } catch {}
    }
    for (const file of files) await fs.unlink(file);

    // Fully remove the directory if it's an uploaded asset folder
    if (upload) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }

    return NextResponse.json({ success: true, deletedUrls: files.map(file => '/api/files/' + path.relative(root, file).split(path.sep).join('/')) });
  } catch (error) {
    console.error('[Delete reel media]', error);
    return NextResponse.json({ error: 'Media could not be completely deleted. Please retry.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!isSameOriginAuthRequest(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });

  try {
    const body = await req.json();
    if (typeof body.fileUrl !== 'string' || !body.fileUrl.startsWith('/api/files/') || /[?#]/.test(body.fileUrl)) {
      return NextResponse.json({ error: 'Invalid media URL.' }, { status: 400 });
    }

    const relative = decodeURIComponent(body.fileUrl.slice(11));
    if (relative.split(/[\\/]/).some(part => !part || part.startsWith('.'))) {
      return NextResponse.json({ error: 'Invalid media path.' }, { status: 400 });
    }

    const filename = resolveStoragePath(relative);
    const isAdmin = user.role === 'admin' || user.id === 'usr_admin';
    if (!isAdmin && !(await canReadMedia(user.id, filename))) {
      // Auto-claim legacy unowned asset folder if owner file is missing
      const safeFilename = path.resolve(filename);
      const assetDir = path.dirname(safeFilename);
      const ownerFile = path.join(assetDir, '.owner.json');
      let claimed = false;
      if (!fsSync.existsSync(ownerFile)) {
        try {
          await fs.writeFile(ownerFile, JSON.stringify({ userId: user.id }), 'utf8');
          claimed = await canReadMedia(user.id, filename);
        } catch {}
      }
      if (!claimed) {
        return NextResponse.json({ error: 'Media unavailable or not owned by this account.' }, { status: 403 });
      }
    }

    const root = await fs.realpath(APP_CONFIG.storageRoot);
    const realFile = assertSafePath(await fs.realpath(filename), root);
    const assetDir = path.dirname(realFile);
    const metaFile = path.join(assetDir, '.meta.json');

    let meta: any = {};
    if (fsSync.existsSync(metaFile)) {
      try {
        meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
      } catch {}
    } else {
      meta = {
        id: path.basename(assetDir),
        fileName: path.basename(realFile),
        fileUrl: body.fileUrl,
        size: (await fs.stat(realFile)).size,
      };
    }

    // Handle Rename
    if (typeof body.fileName === 'string' && body.fileName.trim()) {
      const cleanName = body.fileName.trim();
      const originalExt = path.extname(meta.fileName || realFile).toLowerCase();
      const newExt = path.extname(cleanName).toLowerCase();
      meta.fileName = newExt ? cleanName : `${cleanName}${originalExt}`;
    }

    // Handle Favorite Toggle
    if (typeof body.isFavorite === 'boolean') {
      meta.isFavorite = body.isFavorite;
    }

    await fs.writeFile(metaFile, JSON.stringify(meta, null, 2), 'utf8');

    return NextResponse.json({
      success: true,
      asset: {
        id: meta.id || path.basename(assetDir),
        fileName: meta.fileName,
        fileUrl: meta.fileUrl || body.fileUrl,
        isFavorite: Boolean(meta.isFavorite),
      },
    });
  } catch (error) {
    console.error('[Update media metadata]', error);
    return NextResponse.json({ error: 'Failed to update media asset.' }, { status: 500 });
  }
}
