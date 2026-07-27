import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  addToast,
  removeToast,
  toastDuration,
  type Toast,
  type ToastRequest,
} from "./toast-model";

type ToastListener = (toast: Toast) => void;

let listener: ToastListener | null = null;
let nextId = 1;
let queued: Toast[] = [];

function registerToastListener(next: ToastListener): () => void {
  listener = next;
  const replay = queued;
  queued = [];
  for (const toast of replay) {
    next(toast);
  }
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * Shows a transient notice, optionally with one action (Undo and friends).
 * Queued and replayed when the host is not mounted yet, so actions can publish
 * without knowing about React.
 */
export function showToast(request: ToastRequest): void {
  const toast: Toast = { ...request, id: nextId++ };
  if (listener) {
    listener(toast);
  } else {
    queued = addToast(queued, toast);
  }
}

type ItemProps = {
  toast: Toast;
  onDismiss: (id: number) => void;
};

function ToastItem({ toast, onDismiss }: ItemProps) {
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toastDuration(toast));
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast]);
  return (
    <motion.div
      layout
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-[calc(var(--radius)+2px)] border border-border bg-popover px-3 py-2.5 text-[13px] text-popover-foreground shadow-[0_12px_32px_hsl(var(--scrim)/0.35)]"
    >
      <span className="min-w-0 flex-1 truncate">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded-[var(--radius)] border border-border bg-muted/55 px-2 py-1 text-[11px] font-[560] text-foreground/[0.86] transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => {
            toast.action?.run();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onDismiss(toast.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </motion.div>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  useEffect(
    () =>
      registerToastListener((toast) =>
        setToasts((current) => addToast(current, toast)),
      ),
    [],
  );
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={(id) => setToasts((current) => removeToast(current, id))}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
