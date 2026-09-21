import { createContext, useCallback, useContext, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { CloseIcon } from "@/shared/icons/static";
import { haptic } from "@/shared/lib/haptics";
import { cn } from "@/shared/lib/utils";
import { bindOverlayBack } from "@/shell/overlay-history";
import { pullCloses, pullOffset } from "./dialog-pull";

type PullState = {
  pointerId: number;
  y: number;
};

const SETTLE_MS = 200;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Lets callers veto the Escape-driven close (call `preventDefault`), e.g. while a child is mid-capture. */
  onCancel?: (event: Event) => void;
  showHeader?: boolean;
  /** Extra class on the dialog element, e.g. for per-dialog sizing. */
  className?: string;
};

const DialogCloseContext = createContext<(() => void) | null>(null);

/**
 * Closes the enclosing dialog through the native element, synchronously
 * dropping it out of the top layer. Content that acts on the page as it closes
 * — running a command, opening a note — must use this rather than flipping the
 * caller's open state, because everything outside an open modal dialog is inert
 * and refuses focus until the element itself is closed.
 */
export function useDialogClose(): () => void {
  const close = useContext(DialogCloseContext);
  if (close === null) {
    throw new Error("useDialogClose must be called inside a <Dialog>.");
  }
  return close;
}

/**
 * Dependency-free modal built on the native `<dialog>` element, so focus
 * trapping, Escape handling, and top-layer stacking come from the platform.
 * Renders nothing while closed and mounts its content fresh on every open;
 * callers own the open state, mirroring the CommandPalette contract.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
  onKeyDown,
  onCancel,
  showHeader = true,
}: Props) {
  if (!open) {
    return null;
  }
  return (
    <DialogShell
      title={title}
      className={className}
      onClose={() => onOpenChange(false)}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      showHeader={showHeader}
    >
      {children}
    </DialogShell>
  );
}

type ShellProps = {
  title: string;
  children: ReactNode;
  className?: string;
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onCancel?: (event: Event) => void;
  showHeader: boolean;
};

const FIRST_CONTROL_SELECTOR =
  'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

// `showModal()` focuses the first focusable area in tree order. Chromium 144+
// makes scroll containers focusable, so the dialog body outranks the input it
// wraps, and React's `autoFocus` leaves no `autofocus` attribute for the
// platform to delegate to — the palette opened with its query field unfocused.
function moveFocusOffScrollContainer(body: HTMLElement): void {
  if (document.activeElement !== body) {
    return;
  }
  body.querySelector<HTMLElement>(FIRST_CONTROL_SELECTOR)?.focus();
}

function isTopmostOpenDialog(dialog: HTMLDialogElement): boolean {
  const open = document.querySelectorAll("dialog[open]");
  return open[open.length - 1] === dialog;
}

function DialogShell({
  title,
  children,
  className,
  onClose,
  onKeyDown,
  onCancel,
  showHeader,
}: ShellProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const handlersRef = useRef({ onClose, onKeyDown, onCancel });
  const titleId = useId();

  useEffect(() => {
    handlersRef.current = { onClose, onKeyDown, onCancel };
  });

  // A focused search input swallows the native Escape-driven cancel to clear
  // itself (observed on WebKitGTK even when empty), so Escape must be handled
  // at keydown before input defaults. With that constraint the rest of the
  // dialog wiring attaches natively too, keeping one deterministic path.
  //
  // Escape only acts on the topmost open dialog, and a window-level fallback
  // covers keydowns that never bubble through this element: WebKitGTK moves
  // focus out of a modal once an autoplaying <video> starts, so Escape in a
  // stacked lightbox otherwise lands on the dialog underneath and closes it.
  useEffect(() => {
    const mounted = ref.current;
    if (!mounted) {
      return;
    }
    const dialog: HTMLDialogElement = mounted;
    function closeFromEscape(event: KeyboardEvent) {
      event.preventDefault();
      const cancelEvent = new Event("cancel", { cancelable: true });
      handlersRef.current.onCancel?.(cancelEvent);
      if (!cancelEvent.defaultPrevented) {
        dialog.close();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      handlersRef.current.onKeyDown?.(event);
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !isTopmostOpenDialog(dialog)
      ) {
        return;
      }
      closeFromEscape(event);
    }
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        (event.target instanceof Node && dialog.contains(event.target)) ||
        !isTopmostOpenDialog(dialog)
      ) {
        return;
      }
      closeFromEscape(event);
    }
    function handleCancel(event: Event) {
      handlersRef.current.onCancel?.(event);
    }
    function handleClose() {
      handlersRef.current.onClose();
    }
    function handlePointerDown(event: PointerEvent) {
      if (event.target === dialog) {
        dialog.close();
      }
    }
    dialog.addEventListener("keydown", handleKeyDown);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleWindowKeyDown);
    dialog.showModal();
    if (bodyRef.current) {
      moveFocusOffScrollContainer(bodyRef.current);
    }
    // On a phone the back gesture closes the dialog on top, through the
    // native close so the caller sees the same event as Escape.
    const releaseBack = bindOverlayBack(() => dialog.close());
    return () => {
      releaseBack();
      dialog.removeEventListener("keydown", handleKeyDown);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
      // Only reclaim focus if it never left the dialog. Content that closes
      // itself and then focuses something else — a command opening a note —
      // has already placed the caret where the user wants it.
      const active = document.activeElement;
      const focusStillInside =
        active === null || active === document.body || dialog.contains(active);
      if (focusStillInside && previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  const close = useCallback(() => ref.current?.close(), []);

  // A touch on the grabber or the header pulls the dialog down with the
  // finger and closes it past the threshold, the way a native sheet does.
  // Only those two regions carry `touch-action: none`, so the body keeps
  // scrolling and the browser never claims the pull as a pan.
  const pullRef = useRef<PullState | null>(null);
  function onPullStart(event: ReactPointerEvent<HTMLElement>): void {
    if (event.pointerType !== "touch") {
      return;
    }
    pullRef.current = { pointerId: event.pointerId, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPullMove(event: ReactPointerEvent<HTMLElement>): void {
    const pull = pullRef.current;
    const dialog = ref.current;
    if (!pull || !dialog || event.pointerId !== pull.pointerId) {
      return;
    }
    dialog.classList.remove("dialog-settle");
    dialog.style.transform = `translateY(${pullOffset(event.clientY - pull.y)}px)`;
  }
  function onPullEnd(event: ReactPointerEvent<HTMLElement>, commit: boolean): void {
    const pull = pullRef.current;
    const dialog = ref.current;
    pullRef.current = null;
    if (!pull || !dialog || event.pointerId !== pull.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (commit && pullCloses(event.clientY - pull.y)) {
      dialog.style.transform = "";
      haptic("select");
      dialog.close();
      return;
    }
    dialog.classList.add("dialog-settle");
    dialog.style.transform = "";
    window.setTimeout(() => dialog.classList.remove("dialog-settle"), SETTLE_MS);
  }
  const pullHandlers = {
    onPointerDown: onPullStart,
    onPointerMove: onPullMove,
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => onPullEnd(event, true),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => onPullEnd(event, false),
  };

  return createPortal(
    <DialogCloseContext.Provider value={close}>
      <dialog
        ref={ref}
        className={cn(
          "dialog inset-0 m-auto flex h-fit max-h-[calc(var(--viewport-height)*0.72)] w-[min(680px,calc(100vw-24px))] flex-col rounded-[calc(var(--radius)+4px)] border border-border bg-popover p-0 text-popover-foreground shadow-[0_16px_48px_hsl(var(--scrim)/0.4)] backdrop:bg-scrim/55",
          className,
        )}
        aria-labelledby={titleId}
      >
        <div className="dialog-grabber" aria-hidden="true" {...pullHandlers} />
        {showHeader ? (
          <header
            className="dialog-header flex items-center justify-between border-b border-border px-3.5 py-3"
            {...pullHandlers}
          >
            <h2 id={titleId} className="dialog-title m-0 text-sm font-semibold">
              {title}
            </h2>
            <button
              type="button"
              className="dialog-close flex cursor-pointer rounded-[var(--radius)] border-none bg-transparent p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close dialog"
              onClick={close}
            >
              <CloseIcon size={16} />
            </button>
          </header>
        ) : (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        {/* flex-auto, not flex-1: WebKitGTK collapses basis-0 items inside an
            auto-height column, rendering every dialog body at zero height. */}
        <div ref={bodyRef} className="dialog-body min-h-0 flex-auto overflow-y-auto">
          {children}
        </div>
      </dialog>
    </DialogCloseContext.Provider>,
    document.body,
  );
}
