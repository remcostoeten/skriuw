export type ToastAction = {
  label: string;
  run: () => void;
};

export type ToastRequest = {
  message: string;
  action?: ToastAction;
  durationMs?: number;
};

export type Toast = ToastRequest & { id: number };

export const TOAST_DURATION_MS = 7000;

/** Newest toast wins the bottom slot; older ones drop off past this depth. */
export const MAX_VISIBLE_TOASTS = 3;

export function addToast(toasts: readonly Toast[], toast: Toast): Toast[] {
  return [...toasts, toast].slice(-MAX_VISIBLE_TOASTS);
}

export function removeToast(toasts: readonly Toast[], id: number): Toast[] {
  return toasts.filter((toast) => toast.id !== id);
}

export function toastDuration(toast: Toast): number {
  return toast.durationMs ?? TOAST_DURATION_MS;
}
