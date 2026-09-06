export type ConflictRetry = {
  /** One save attempt against the revision the editor currently holds. */
  attempt: () => Promise<void>;
  /**
   * Called after a revision conflict. Returns true when a fresher record was
   * adopted (merged into the editor) so the next attempt can start from it;
   * false when nothing newer arrived, which makes the conflict final.
   */
  adoptFresh: () => boolean;
  isConflict: (error: unknown) => boolean;
  retries: number;
};

/**
 * Runs a save, merging against the winning revision and retrying when the
 * backend reports a revision conflict. After `retries` losses, or when the
 * conflict comes without a newer record, the error propagates so the save
 * sequencer records the failure and the user gets an explicit retry.
 */
export async function saveWithConflictRetry(retry: ConflictRetry): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await retry.attempt();
      return;
    } catch (error) {
      if (attempt >= retry.retries || !retry.isConflict(error) || !retry.adoptFresh()) {
        throw error;
      }
    }
  }
}
