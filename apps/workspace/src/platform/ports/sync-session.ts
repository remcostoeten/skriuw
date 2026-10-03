/**
 * The cloud session the browser sync driver runs under. Platform code cannot
 * read the auth feature, so the application binds this port at startup; until
 * it does, the browser sync driver behaves as signed out.
 */
export type SyncSessionPort = {
  /** The trusted cloud base URL. Throws with the reason when cloud sync is unavailable. */
  baseUrl(): string;
  persistedToken(): string | undefined;
  discardPersistedSession(): void;
  /** Readable reason for a failed sync attempt, including rejections that are not `Error`s. */
  describeFailure(error: unknown): string;
};
