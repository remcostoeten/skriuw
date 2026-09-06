/**
 * Serializes remote reconciliation against local commits. Commits are
 * readers: any number run concurrently, but none starts while a reconcile
 * holds the gate. A reconcile is the writer: it waits for in-flight commits to
 * settle, then keeps new ones out until its read and apply are done. Commits
 * that a release woke up enter before the next hold, so back-to-back
 * reconciles cannot starve them.
 *
 * Optimistic renderer updates never wait on the gate (they must stay
 * synchronous); `noteLocalCommit` stamps them so a reconcile can tell that
 * local state moved underneath its read and schedule a rerun.
 */

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type Hold = Deferred & {
  waiters: number;
  resumed: Deferred;
};

export type CommitGate = {
  /** Records an optimistic local apply so a concurrent reconcile knows to rerun. */
  noteLocalCommit(): void;
  /** Monotonic count of optimistic applies; compared around a reconcile. */
  commitSequence(): number;
  /** Runs a durable commit once no reconcile holds the gate. */
  enterCommit<T>(run: () => Promise<T>): Promise<T>;
  /** Runs a reconcile with the gate held: after in-flight commits, before new ones. */
  holdForReconcile<T>(run: () => Promise<T>): Promise<T>;
  /** Whether a reconcile currently holds the gate. */
  held(): boolean;
};

export function createCommitGate(): CommitGate {
  let sequence = 0;
  let inFlight = 0;
  let hold: Hold | null = null;
  let lastReleased: Hold | null = null;
  let drained: Deferred | null = null;
  const holdQueue: Deferred[] = [];

  function settleDrain(): void {
    if (inFlight === 0 && drained) {
      const settled = drained;
      drained = null;
      settled.resolve();
    }
  }

  async function enterCommit<T>(run: () => Promise<T>): Promise<T> {
    while (hold) {
      const current = hold;
      current.waiters += 1;
      await current.promise;
      current.waiters -= 1;
      if (current.waiters === 0) current.resumed.resolve();
    }
    inFlight += 1;
    try {
      return await run();
    } finally {
      inFlight -= 1;
      settleDrain();
    }
  }

  async function holdForReconcile<T>(run: () => Promise<T>): Promise<T> {
    const turn = deferred();
    holdQueue.push(turn);
    while (holdQueue[0] !== turn) {
      await holdQueue[0]!.promise;
    }
    while (hold) {
      await hold.promise;
    }
    if (lastReleased && lastReleased.waiters > 0) {
      await lastReleased.resumed.promise;
    }
    const acquired: Hold = { ...deferred(), waiters: 0, resumed: deferred() };
    hold = acquired;
    holdQueue.shift();
    while (inFlight > 0) {
      drained ??= deferred();
      await drained.promise;
    }
    try {
      return await run();
    } finally {
      hold = null;
      lastReleased = acquired;
      if (acquired.waiters === 0) acquired.resumed.resolve();
      acquired.resolve();
      turn.resolve();
    }
  }

  return {
    noteLocalCommit: () => {
      sequence += 1;
    },
    commitSequence: () => sequence,
    enterCommit,
    holdForReconcile,
    held: () => hold !== null,
  };
}

/** The renderer's single gate; tests construct their own with `createCommitGate`. */
export const commitGate = createCommitGate();
