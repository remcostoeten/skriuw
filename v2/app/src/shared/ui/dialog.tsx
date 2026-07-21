import { useEffect, useId, useRef } from "react";
import type { KeyboardEventHandler, ReactNode } from "react";
import { CloseIcon } from "../icons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
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
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
  showHeader: boolean;
};

function DialogShell({
  title,
  children,
  className,
  onClose,
  onKeyDown,
  showHeader,
}: ShellProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const titleId = useId();

  useEffect(() => {
    ref.current?.showModal();
    return () => {
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.target === ref.current) {
          ref.current?.close();
        }
      }}
    >
      {showHeader ? (
        <header className="dialog-header">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="dialog-close"
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
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
