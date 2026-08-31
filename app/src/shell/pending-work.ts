/**
 * Registry of in-flight work (debounced saves, async blob persistence) that
 * must finish before the window is allowed to close. Modules register a
 * flush function once; `flushPendingWork` awaits every registered flush.
 *
 * Critical registrations protect user content and may keep the window open
 * when they fail. Best-effort registrations cover UI continuity (layout,
 * expansion, last-note state) whose failures are reported at their
 * persistence binder; they are awaited but never allowed to fail a flush,
 * so they cannot hold the window hostage.
 */

type PendingWork = () => Promise<void>;

type Registration = {
  bestEffort: boolean;
};

const registrations = new Map<PendingWork, Registration>();

export function registerPendingWork(
  work: PendingWork,
  options: { bestEffort?: boolean } = {},
): () => void {
  registrations.set(work, { bestEffort: options.bestEffort === true });
  return () => registrations.delete(work);
}

function start(bestEffort: boolean): Promise<void>[] {
  return [...registrations]
    .filter(([, registration]) => registration.bestEffort === bestEffort)
    .map(([work]) => work());
}

export function flushCriticalPendingWork(): Promise<void> {
  return Promise.all(start(false)).then(() => undefined);
}

export function flushBestEffortPendingWork(): Promise<void> {
  return Promise.allSettled(start(true)).then(() => undefined);
}

export async function flushPendingWork(): Promise<void> {
  await Promise.all([flushCriticalPendingWork(), flushBestEffortPendingWork()]);
}
