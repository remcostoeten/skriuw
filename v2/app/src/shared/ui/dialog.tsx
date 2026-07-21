import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { CloseIcon } from "../icons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Extra class on the dialog element, e.g. for per-dialog sizing. */
  className?: string;
};

/**
 * Dependency-free modal built on the native `<dialog>` element, so focus
 * trapping, Escape handling, and top-layer stacking come from the platform.
 * Renders nothing while closed and mounts its content fresh on every open;
 * callers own the open state, mirroring the CommandPalette contract.
 */
export function Dialog({ open, onOpenChange, title, children, className }: Props) {
  if (!open) {
    return null;
  }
  return (
    <DialogShell title={title} className={className} onClose={() => onOpenChange(false)}>
      {children}
    </DialogShell>
  );
}

type ShellProps = {
  title: string;
  children: ReactNode;
  className?: string;
  onClose: () => void;
};

function DialogShell({ title, children, className, onClose }: ShellProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(event) => {
        if (event.target === ref.current) {
          ref.current?.close();
        }
      }}
    >
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
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
