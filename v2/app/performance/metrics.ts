import type { TimingSummary } from "./types";

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

export function summarize(samples: readonly number[]): TimingSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

export function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export async function estimateFrameDuration(): Promise<number> {
  const samples: number[] = [];
  let previous = await nextFrame();
  for (let index = 0; index < 12; index += 1) {
    const current = await nextFrame();
    samples.push(current - previous);
    previous = current;
  }
  return summarize(samples).p50Ms;
}
