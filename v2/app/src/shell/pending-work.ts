/**
 * Registry of in-flight work (debounced saves, async blob persistence) that
 * must finish before the window is allowed to close. Modules register a
 * flush function once; `flushPendingWork` awaits every registered flush.
 */

type PendingWork = () => Promise<void>;

const registrations = new Set<PendingWork>();

export function registerPendingWork(work: PendingWork): () => void {
  registrations.add(work);
  return () => registrations.delete(work);
}

export async function flushPendingWork(): Promise<void> {
  await Promise.all([...registrations].map((work) => work()));
}
