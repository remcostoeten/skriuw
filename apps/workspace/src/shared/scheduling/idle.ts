/**
 * @name scheduleIdle
 * @description Runs `run` when the main thread is idle, or after `timeoutMs`
 * at the latest, falling back to a zero-delay timer where idle callbacks are
 * unavailable. Returns a function that cancels the pending run.
 *
 * @example
 * const cancel = scheduleIdle(() => persistLayout(), 2_000);
 */
export function scheduleIdle(run: () => void, timeoutMs: number): () => void {
  if (typeof requestIdleCallback !== "function") {
    const timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  }
  const handle = requestIdleCallback(run, { timeout: timeoutMs });
  return () => cancelIdleCallback(handle);
}
