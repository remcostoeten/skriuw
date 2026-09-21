import type { ProfilerOnRenderCallback } from "react";
import type { RenderLedger } from "./types";

const ledger: RenderLedger = {
  renders: {},
  mounts: {},
  unmounts: {},
  profiledRenders: {},
  commits: 0,
  commitDurationsMs: [],
};

const commitTimes = new Set<number>();

export function recordRender(name: string): void {
  ledger.renders[name] = (ledger.renders[name] ?? 0) + 1;
}

export function recordMount(name: string): () => void {
  ledger.mounts[name] = (ledger.mounts[name] ?? 0) + 1;
  return () => {
    ledger.unmounts[name] = (ledger.unmounts[name] ?? 0) + 1;
  };
}

export const recordProfilerCommit: ProfilerOnRenderCallback = (
  id,
  _phase,
  actualDuration,
  _baseDuration,
  _startTime,
  commitTime,
) => {
  ledger.profiledRenders[id] = (ledger.profiledRenders[id] ?? 0) + 1;
  if (!commitTimes.has(commitTime)) {
    commitTimes.add(commitTime);
    ledger.commits += 1;
    ledger.commitDurationsMs.push(actualDuration);
  }
};

export function resetLedger(): void {
  ledger.renders = {};
  ledger.commits = 0;
  ledger.profiledRenders = {};
  ledger.commitDurationsMs = [];
  commitTimes.clear();
}

export function readLedger(): RenderLedger {
  return {
    renders: { ...ledger.renders },
    mounts: { ...ledger.mounts },
    unmounts: { ...ledger.unmounts },
    profiledRenders: { ...ledger.profiledRenders },
    commits: ledger.commits,
    commitDurationsMs: [...ledger.commitDurationsMs],
  };
}
