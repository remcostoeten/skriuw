import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";

type Size = "sm" | "md";

type Props = {
  confirmLabel: string;
  onConfirm: () => void;
  renderIdle: (arm: () => void) => ReactNode;
  message?: ReactNode;
  cancelLabel?: string;
  size?: Size;
  className?: string;
};

const sizeStyles: Record<Size, { container: string; button: string; message: string; gap: string }> =
  {
    sm: {
      container: "min-h-[24px]",
      button: "h-[22px] px-[8px] text-[11px]",
      message: "text-[11px]",
      gap: "gap-[4px]",
    },
    md: {
      container: "min-h-[28px]",
      button: "h-[26px] px-[10px] text-[12px]",
      message: "text-[12px]",
      gap: "gap-[6px]",
    },
  };

export function InlineConfirm({
  confirmLabel,
  onConfirm,
  renderIdle,
  message,
  cancelLabel = "Cancel",
  size = "md",
  className,
}: Props) {
  const [armed, setArmed] = useState(false);
  const reduceMotion = useReducedMotion();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const styles = sizeStyles[size];

  useEffect(() => {
    if (armed) {
      confirmRef.current?.focus();
    }
  }, [armed]);

  const shift = reduceMotion ? 0 : 8;

  return (
    <div className={cn("flex items-center justify-end", styles.container, className)}>
      <AnimatePresence mode="wait" initial={false}>
        {armed ? (
          <motion.div
            key="confirm"
            role="group"
            aria-label={confirmLabel}
            className={cn("flex items-center", styles.gap)}
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: shift }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setArmed(false);
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setArmed(false);
              }
            }}
          >
            {message ? (
              <span className={cn("mr-[2px] font-[560] text-muted-foreground", styles.message)}>
                {message}
              </span>
            ) : null}
            <button
              type="button"
              className={cn(
                "inline-flex items-center rounded-[var(--radius-md)] border border-border bg-transparent font-[560] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground",
                styles.button,
              )}
              onClick={() => setArmed(false)}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={cn(
                "inline-flex items-center rounded-[var(--radius-md)] border border-destructive/45 bg-destructive/[0.14] font-[560] text-destructive transition-colors hover:bg-destructive/25",
                styles.button,
              )}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, x: -shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -shift }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            {renderIdle(() => setArmed(true))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
