const queues = new Map<string, Promise<unknown>>();

/** Serialize read-modify-write manifests so simultaneous clip edits keep each other's fields. */
export async function withProjectMutation<T>(
  id: string,
  action: () => Promise<T>
): Promise<T> {
  const previous = queues.get(id) || Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  queues.set(id, current);
  try {
    return await current;
  } finally {
    if (queues.get(id) === current) queues.delete(id);
  }
}
