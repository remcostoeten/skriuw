import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/shared/lib/utils";

type Props = {
  defaultValue: string;
  ariaLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  leading?: ReactNode;
  className?: string;
  inputClassName?: string;
};

export function InlineEdit({
  defaultValue,
  ariaLabel,
  onSubmit,
  onCancel,
  leading,
  className,
  inputClassName,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);
  const reduceMotion = useReducedMotion();

  function settle(action: () => void): void {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    action();
  }

  return (
    <form
      className={cn("flex min-w-0 flex-1 items-center gap-[10px] px-[6px] py-[4px]", className)}
      onSubmit={(event) => {
        event.preventDefault();
        settle(() => onSubmit(inputRef.current?.value ?? ""));
      }}
    >
      {leading}
      <motion.input
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        defaultValue={defaultValue}
        autoFocus
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "left center" }}
        className={cn(
          "-ml-[7px] min-w-0 flex-1 rounded-[var(--radius-md)] bg-transparent px-[7px] py-[3px]",
          "text-[13px] font-[560] text-foreground outline-none",
          "shadow-[inset_0_0_0_1px_hsl(var(--border))]",
          "transition-[box-shadow,background-color] duration-[130ms] ease-out",
          "focus:bg-background/60 focus:shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.5),0_0_0_3px_hsl(var(--ring)/0.14)]",
          inputClassName,
        )}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            settle(onCancel);
          }
        }}
        onBlur={(event) => {
          const value = event.currentTarget.value;
          settle(() => onSubmit(value));
        }}
      />
    </form>
  );
}
