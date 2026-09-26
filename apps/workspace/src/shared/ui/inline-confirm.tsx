import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/shared/lib/utils";

type Size = "sm" | "md";

type Props = {
  /** Text of the confirm button once armed. */
  confirmLabel: string;
  /** Called when the armed confirm button is pressed. */
  onConfirm: () => void;
  /** Renders the resting control; call `arm` to switch to the confirm step. */
  renderIdle: (arm: () => void) => ReactNode;
  /** Prompt shown next to the buttons while armed. */
  message?: ReactNode;
  /** Text of the cancel button. */
  cancelLabel?: string;
  /** Button density. */
  size?: Size;
  /** Extra class on the wrapper. */
  className?: string;
  /** Controlled arm state; omit to let the component manage it internally. */
  armed?: boolean;
  /** Reports arm state changes; pair with `armed` to control it. */
  onArmedChange?: (armed: boolean) => void;
  /** "stacked" puts a long message on its own line above the buttons. */
  messagePlacement?: "inline" | "stacked";
};

const sizeStyles: Record<
  Size,
  { container: string; button: string; message: string; gap: string }
> = {
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
  armed: armedProp,
  onArmedChange,
  messagePlacement = "inline",
}: Props) {
  const [internalArmed, setInternalArmed] = useState(false);
  const armed = armedProp ?? internalArmed;
  const setArmed = onArmedChange ?? setInternalArmed;
  const confirmRef = useRef<HTMLButtonElement>(null);
  const styles = sizeStyles[size];

  useEffect(() => {
    if (armed) {
      confirmRef.current?.focus();
    }
  }, [armed]);

  const shift = 8;

  return (
    <div className={cn("flex items-center justify-end", styles.container, className)}>
      <AnimatePresence mode="wait" initial={false}>
        {armed ? (
          <motion.div
            key="confirm"
            role="group"
            aria-label={confirmLabel}
            className={cn(
              "flex",
              messagePlacement === "stacked"
                ? "flex-col items-end gap-1.5"
                : cn("items-center", styles.gap),
            )}
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
              <span
                className={cn(
                  "font-[560] text-muted-foreground",
                  messagePlacement === "stacked"
                    ? "max-w-[280px] text-right leading-[1.35]"
                    : "mr-[2px]",
                  styles.message,
                )}
              >
                {message}
              </span>
            ) : null}
            <div className={cn("flex items-center", styles.gap)}>
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-border bg-transparent font-[560] text-foreground/80 transition-colors hover:bg-muted hover:text-foreground",
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
                  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-destructive/45 bg-destructive/[0.14] font-[560] text-destructive transition-colors hover:bg-destructive/25",
                  styles.button,
                )}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
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
