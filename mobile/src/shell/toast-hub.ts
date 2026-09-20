export type ToastAction = {
  label: string;
  run: () => void;
};

export type ShellToast = {
  id: number;
  message: string;
  action: ToastAction | null;
  durationMs: number;
};

export type ToastRequest = {
  message: string;
  action?: ToastAction;
  durationMs?: number;
};

export type ToastHub = {
  show: (request: ToastRequest) => number;
  dismiss: (id: number) => void;
  /** Runs the toast's action and dismisses it, so an undo can only be taken once. */
  runAction: (id: number) => void;
  current: () => ShellToast | null;
  subscribe: (listener: () => void) => () => void;
};

export const DEFAULT_TOAST_MS = 7_000;

/**
 * One toast at a time, the way the compact shell shows it: a newer message
 * replaces the one on screen, and a dismissal for a message that is no longer
 * current is ignored so an expiring timer never closes its successor.
 */
export function createToastHub(): ToastHub {
  const listeners = new Set<() => void>();
  let toast: ShellToast | null = null;
  let sequence = 0;

  function publish(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    show(request) {
      const id = ++sequence;
      toast = {
        id,
        message: request.message,
        action: request.action ?? null,
        durationMs: request.durationMs ?? DEFAULT_TOAST_MS,
      };
      publish();
      return id;
    },
    dismiss(id) {
      if (toast?.id !== id) {
        return;
      }
      toast = null;
      publish();
    },
    runAction(id) {
      const current = toast;
      if (current?.id !== id) {
        return;
      }
      toast = null;
      publish();
      current.action?.run();
    },
    current() {
      return toast;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
