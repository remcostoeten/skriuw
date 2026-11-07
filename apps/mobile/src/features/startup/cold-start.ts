import type { LaunchAnchor } from "../../../modules/skriuw-platform";

/** R-P4 in `docs/specs/mobile-app.md`: cold start to an interactive shell, at the 95th percentile. */
export const COLD_START_BUDGET_MS = 1500;

export const COLD_START_SAMPLE_LIMIT = 50;

export type ColdStartSample = {
  elapsedMs: number;
  anchor: LaunchAnchor;
  /** Epoch milliseconds of the launch that was measured. */
  at: number;
};

export type ColdStartSummary = {
  count: number;
  latestMs: number;
  p95Ms: number;
  withinBudget: boolean;
};

/**
 * @name appendColdStart
 * @description Adds a launch to the device's history, newest last, keeping only the most recent
 * launches so the percentile follows the current build rather than every build ever installed.
 *
 * @example
 * const next = appendColdStart(samples, { elapsedMs: 912, anchor: "process-start", at: Date.now() });
 */
export function appendColdStart(
  samples: readonly ColdStartSample[],
  sample: ColdStartSample,
  limit: number = COLD_START_SAMPLE_LIMIT,
): ColdStartSample[] {
  return [...samples, sample].slice(-limit);
}

/**
 * @name summarizeColdStarts
 * @description The latest launch and the nearest-rank 95th percentile against the R-P4 budget, or
 * `null` before any launch was measured.
 *
 * @example
 * const summary = summarizeColdStarts(samples);
 * if (summary !== null && !summary.withinBudget) report(summary.p95Ms);
 */
export function summarizeColdStarts(samples: readonly ColdStartSample[]): ColdStartSummary | null {
  const latest = samples.at(-1);
  if (latest === undefined) {
    return null;
  }
  const sorted = samples.map((sample) => sample.elapsedMs).sort((left, right) => left - right);
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? latest.elapsedMs;
  return {
    count: samples.length,
    latestMs: latest.elapsedMs,
    p95Ms,
    withinBudget: p95Ms <= COLD_START_BUDGET_MS,
  };
}

type StoredSample = {
  elapsedMs?: number;
  anchor?: string;
  at?: number;
};

function parseSample(stored: StoredSample | null): ColdStartSample | null {
  if (stored === null) {
    return null;
  }
  const { elapsedMs, anchor, at } = stored;
  if (elapsedMs === undefined || at === undefined || !Number.isFinite(elapsedMs)) {
    return null;
  }
  if (anchor !== "process-start" && anchor !== "app-launch") {
    return null;
  }
  return { elapsedMs, anchor, at };
}

/**
 * @name parseColdStarts
 * @description Reads the stored history, dropping anything malformed instead of failing, since the
 * file is a diagnostic and a damaged one must not stop the app from starting.
 *
 * @example
 * const samples = parseColdStarts(file.exists ? file.textSync() : "");
 */
export function parseColdStarts(text: string): ColdStartSample[] {
  if (text.trim() === "") {
    return [];
  }
  let stored: (StoredSample | null)[];
  try {
    stored = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored.flatMap((entry) => {
    const sample = parseSample(entry);
    return sample === null ? [] : [sample];
  });
}
