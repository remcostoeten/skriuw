import type {
  BridgePort,
  NoteLockSecretInput,
} from "@skriuw/renderer-core/bridge/port";
import type {
  NoteLockKind,
  NoteLockState,
} from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

/**
 * What this feature needs from the runtime.
 *
 * Taken from `BridgePort` rather than restated, so the phone cannot drift from
 * the desktop and browser runtimes on the shape of a lock command. Every one
 * of them is answered inside Rust: the secret is derived there, the content
 * key lives in `LockSession` on the storage thread, and the only key material
 * that ever crosses into JavaScript is ciphertext the runtime already opened
 * into a document (ADR-0044).
 */
export type MobileLockPort = Pick<
  BridgePort,
  | "noteLockState"
  | "configureNoteLock"
  | "unlockNoteLock"
  | "recoverNoteLock"
  | "changeNoteLockSecret"
  | "relockNoteLock"
  | "removeNoteLock"
  | "readLockedDocuments"
  | "readWorkspaceDelta"
>;

/**
 * The store and the command surface one lock session reads and writes.
 * `WorkspaceSession` from `src/bridge/commit.ts` satisfies it; the narrower
 * type keeps everything that does not write operations testable without one.
 */
export type LockSession = {
  store: RendererStore;
  bridge: MobileLockPort;
  reportFailure: (error: unknown) => void;
};

/**
 * Where the application is in the platform's lifecycle, as React Native's
 * `AppState` reports it.
 *
 * `inactive` is the state that matters here and has no desktop counterpart:
 * iOS enters it while the app switcher is being opened, before the snapshot
 * that ends up in the switcher is taken. Anything secret has to be off the
 * screen by the time this value arrives, not after the `background` that
 * follows it.
 */
export type AppPhase = "active" | "inactive" | "background";

/** A platform value this feature watches. Returns an unsubscribe. */
export type Observable<T> = {
  current: () => T;
  subscribe: (listener: (value: T) => void) => () => void;
};

/**
 * The platform's own screen protection: Android's `FLAG_SECURE`, iOS's
 * snapshot-time cover view.
 *
 * It is a port rather than a call because only the native side can act inside
 * the window the operating system gives it. The React cover this feature draws
 * over the shell is raised from a JavaScript listener, which is one turn of
 * the event loop later than `applicationWillResignActive` returns; on a busy
 * frame the snapshot can be taken first. A bound guard closes that race, and
 * an unbound one leaves the cover as the only protection.
 */
export type ScreenGuard = {
  conceal: () => void;
  reveal: () => void;
};

export type { NoteLockKind, NoteLockSecretInput, NoteLockState };
