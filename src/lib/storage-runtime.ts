import path from 'node:path';

export type StorageTaskKind = 'upload' | 'render' | 'export' | 'transcode' | 'analysis';

interface StorageTask {
  id: string;
  ownerId: string;
  kind: StorageTaskKind;
  paths: string[];
  startedAt: number;
  cancel?: () => void | Promise<void>;
  done: Promise<void>;
  finish: () => void;
}

const globalRegistry = globalThis as typeof globalThis & {
  reelsparkStorageTasks?: Map<string, StorageTask>;
};
const tasks = globalRegistry.reelsparkStorageTasks ??= new Map<string, StorageTask>();

function overlaps(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  const relative = path.relative(left, right);
  const reverse = path.relative(right, left);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) ||
    reverse === '' || (!reverse.startsWith(`..${path.sep}`) && reverse !== '..' && !path.isAbsolute(reverse));
}

async function waitForTask(task: StorageTask, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    task.done.then(() => false),
    new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(true), timeoutMs);
      timeout.unref?.();
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  return !timedOut;
}

export function registerStorageTask(
  task: Omit<StorageTask, 'startedAt' | 'done' | 'finish'>,
): () => void {
  if (tasks.has(task.id)) throw new Error('An operation with this ID is already active');
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const normalized: StorageTask = {
    ...task,
    paths: task.paths.map((item) => path.resolve(item)),
    startedAt: Date.now(),
    done,
    finish: resolveDone,
  };
  tasks.set(task.id, normalized);
  return () => {
    if (tasks.get(task.id) === normalized) tasks.delete(task.id);
    normalized.finish();
  };
}

export function isStoragePathActive(target: string): boolean {
  return Array.from(tasks.values()).some((task) => task.paths.some((item) => overlaps(item, target)));
}

/** Cancel every in-process task touching this path and wait for each cancellation hook. */
export async function cancelStorageTasksUnder(target: string): Promise<number> {
  const matching = Array.from(tasks.values()).filter((task) => task.paths.some((item) => overlaps(item, target)));
  await Promise.allSettled(matching.map(async (task) => {
    await task.cancel?.();
    await waitForTask(task, 20_000);
  }));
  return matching.length;
}

export async function cancelStorageTask(id: string, ownerId: string): Promise<'cancelled' | 'not-found' | 'timeout'> {
  const task = tasks.get(id);
  if (!task || task.ownerId !== ownerId || task.kind !== 'upload') return 'not-found';
  await task.cancel?.();
  const completed = await waitForTask(task, 20_000);
  return completed ? 'cancelled' : 'timeout';
}

export function getActiveStorageTasks(): Array<Pick<StorageTask, 'id' | 'kind' | 'startedAt'>> {
  return Array.from(tasks.values(), ({ id, kind, startedAt }) => ({ id, kind, startedAt }));
}
