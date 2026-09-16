import type { LockDialogRequest } from "./lock-model";

type LockDialogListener = (request: LockDialogRequest) => void;

let listener: LockDialogListener | null = null;
let pending: LockDialogRequest | null = null;

export function registerLockDialog(next: LockDialogListener): () => void {
  listener = next;
  if (pending !== null) {
    const request = pending;
    pending = null;
    next(request);
  }
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * Opens the lock dialog for `request`. A request made before the host mounts
 * is queued and replayed once {@link registerLockDialog} runs.
 */
export function requestLockDialog(request: LockDialogRequest): void {
  if (listener) {
    listener(request);
  } else {
    pending = request;
  }
}
