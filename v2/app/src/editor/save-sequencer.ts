type SaveTask = () => Promise<void>;

export type SaveFailure = {
  noteId: string;
  error: unknown;
};

export class SaveFlushError extends Error {
  readonly failures: readonly SaveFailure[];

  constructor(failures: readonly SaveFailure[]) {
    super(`changes for ${failures.length} note${failures.length === 1 ? "" : "s"} are not durable`);
    this.name = "SaveFlushError";
    this.failures = failures;
  }
}

type FailureListener = (failures: readonly SaveFailure[]) => void;

type TrackedFailure = SaveFailure & { sequence: number };

export class SaveSequencer {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly failures = new Map<string, TrackedFailure>();
  private readonly discardedThrough = new Map<string, number>();
  private nextSequence = 1;

  constructor(private readonly onFailuresChanged: FailureListener = () => {}) {}

  currentFailures(): readonly SaveFailure[] {
    return [...this.failures.values()].map(({ noteId, error }) => ({ noteId, error }));
  }

  private publishFailures(): void {
    this.onFailuresChanged(this.currentFailures());
  }

  discard(noteId: string): void {
    this.discardedThrough.set(noteId, this.nextSequence - 1);
    if (this.failures.delete(noteId)) {
      this.publishFailures();
    }
  }

  enqueue(noteId: string, task: SaveTask): Promise<void> {
    const sequence = this.nextSequence++;
    const previous = this.tails.get(noteId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(task)
      .then(
        () => {
          if (sequence <= (this.discardedThrough.get(noteId) ?? 0)) {
            return;
          }
          const failure = this.failures.get(noteId);
          if (failure && failure.sequence <= sequence) {
            this.failures.delete(noteId);
            this.publishFailures();
          }
        },
        (error: unknown) => {
          if (sequence <= (this.discardedThrough.get(noteId) ?? 0)) {
            return;
          }
          const failure = this.failures.get(noteId);
          if (!failure || failure.sequence <= sequence) {
            this.failures.set(noteId, { noteId, error, sequence });
            this.publishFailures();
          }
          throw error;
        },
      );
    this.tails.set(noteId, next);
    void next
      .finally(() => {
        if (this.tails.get(noteId) === next) {
          this.tails.delete(noteId);
        }
      })
      .catch(() => undefined);
    return next;
  }

  async flush(): Promise<void> {
    while (this.tails.size > 0) {
      await Promise.allSettled([...this.tails.values()]);
    }
    const failures = this.currentFailures();
    if (failures.length > 0) {
      throw new SaveFlushError(failures);
    }
  }
}
