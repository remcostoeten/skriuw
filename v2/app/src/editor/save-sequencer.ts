type SaveTask = () => Promise<void>;

/** Keeps saves for each note in durable acknowledgement order. */
export class SaveSequencer {
  private readonly tails = new Map<string, Promise<void>>();

  enqueue(noteId: string, task: SaveTask): Promise<void> {
    const previous = this.tails.get(noteId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
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
      await Promise.all([...this.tails.values()]);
    }
  }
}
