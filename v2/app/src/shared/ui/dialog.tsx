import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { CloseIcon } from "../icons";
import { cn } from "../lib/utils";

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
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      handlersRef.current.onKeyDown?.(event);
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      const cancelEvent = new Event("cancel", { cancelable: true });
      handlersRef.current.onCancel?.(cancelEvent);
      if (!cancelEvent.defaultPrevented) {
        dialog.close();
      }
    };
    const handleCancel = (event: Event) => {
      handlersRef.current.onCancel?.(event);
    };
    const handleClose = () => {
      handlersRef.current.onClose();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target === dialog) {
        dialog.close();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.showModal();
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("pointerdown", handlePointerDown);
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className={cn(
        "dialog inset-0 m-auto flex h-fit max-h-[72vh] w-[min(680px,calc(100vw-24px))] flex-col rounded-[calc(var(--radius)+4px)] border border-border bg-popover p-0 text-popover-foreground shadow-[0_16px_48px_hsl(var(--scrim)/0.4)] backdrop:bg-scrim/55",
        className,
      )}
      aria-labelledby={titleId}
    >
      {showHeader ? (
        <header className="dialog-header flex items-center justify-between border-b border-border px-3.5 py-3">
          <h2 id={titleId} className="dialog-title m-0 text-sm font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className="dialog-close flex cursor-pointer rounded-[var(--radius)] border-none bg-transparent p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close dialog"
            onClick={() => ref.current?.close()}
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
      <div className="dialog-body min-h-0 flex-auto overflow-y-auto">{children}</div>
    </dialog>,
    document.body,
  );
}
