import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Same-directory staging keeps final render files invisible until they are complete. */
export function createStorageStagingPath(targetPath: string, kind: 'render' | 'partial' = 'render'): string {
  const extension = path.extname(targetPath);
  return path.join(path.dirname(targetPath), `.${kind}-${randomUUID()}${extension}`);
}

/** Replace a final artifact atomically and preserve the previous artifact if the move fails. */
export async function commitStorageFile(stagingPath: string, targetPath: string): Promise<void> {
  const backupPath = path.join(path.dirname(targetPath), `.previous-${randomUUID()}`);
  let backedUp = false;
  try {
    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) throw new Error('The existing output path is not a file');
      await fs.rename(targetPath, backupPath);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.rename(stagingPath, targetPath);
    if (backedUp) await fs.rm(backupPath, { force: true });
  } catch (error) {
    if (backedUp) await fs.rename(backupPath, targetPath).catch(() => undefined);
    throw error;
  } finally {
    await fs.rm(stagingPath, { force: true }).catch(() => undefined);
  }
}

export async function removeStorageFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true }).catch(() => undefined);
}
