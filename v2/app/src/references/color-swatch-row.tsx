import { useMemo } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Tooltip } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/utils";
import { ENTITY_COLOR_OPTIONS, type EntityColorOption } from "./entity-manager-model";

type Props = {
  value: string | null;
  onChange: (color: string | null) => void;
  /** Accessible name of the swatch group, e.g. `Recolor tag ideas`. */
  label: string;
  /** Per-dot entrance variants, supplied when the row animates in as a group. */
  dotVariants?: Variants;
  className?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  ref?: React.Ref<HTMLDivElement>;
};

const NO_COLOR: EntityColorOption = { name: "None", value: "" };

/**
 * The single color picker for tags and people: a contained row of small dots,
 * leading with a dashed "no color" option. Selection reads as a ring around the
 * dot rather than a glyph inside it, so the dot's color stays unobstructed.
 */
export function ColorSwatchRow({
  value,
  onChange,
  label,
  dotVariants,
  className,
  onKeyDown,
  ref,
}: Props) {
  const reduceMotion = useReducedMotion();
  const options = useMemo(() => [NO_COLOR, ...ENTITY_COLOR_OPTIONS], []);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-fit flex-wrap items-center gap-1 rounded-lg border border-theme-divider bg-foreground/[0.025] px-1.5 py-1",
        className,
      )}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const color = option.value === "" ? null : option.value;
        const selected = value === color;
        return (
          <Tooltip key={option.name} label={option.name} side="top">
            <motion.button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-[background-color,box-shadow] duration-[160ms] hover:bg-foreground/[0.07] focus-visible:shadow-[0_0_0_2px_hsl(var(--ring)/0.5)] focus-visible:outline-none"
              variants={reduceMotion ? undefined : dotVariants}
              whileTap={reduceMotion ? undefined : { scale: 0.86 }}
              aria-label={color === null ? "No color" : option.name}
              aria-pressed={selected}
              onClick={() => onChange(color)}
            >
              <span
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground transition-shadow duration-[160ms] data-empty:border data-empty:border-dashed data-empty:border-border data-selected:shadow-[0_0_0_2px_hsl(var(--background)),0_0_0_3.5px_currentColor]"
                style={color === null ? undefined : { background: color, color }}
                data-empty={color === null ? "" : undefined}
                data-selected={selected ? "" : undefined}
              />
            </motion.button>
          </Tooltip>
        );
      })}
    </div>
  );
}
