import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { CheckIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { sectionLabelClass } from "@/shared/ui/section-header";

export const settingsSection = "mx-auto w-full max-w-[680px]";
export const settingsSectionHeading = "mb-10";
export const settingsGroup = "mb-9";
export const settingsGroupTitle = cn("mb-2.5", sectionLabelClass);
export const settingsGroupHint = "mb-3 text-xs text-muted-foreground/80";

export const settingsRow =
  "flex min-h-[52px] items-center justify-between gap-6 border-b border-[hsl(var(--border)/0.58)] py-3 text-[13px] last:border-b-0";
export const settingsInputRow = "max-[620px]:flex-col max-[620px]:items-start";
export const settingsRowLabel = "flex min-w-0 max-w-[460px] flex-col gap-1";
export const settingsRowDescription = "text-xs leading-[1.5] text-muted-foreground";
export const settingsRowDetail =
  "font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]";

export const settingsTransition =
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]";
export const settingsPress = "active:scale-[0.97] motion-reduce:active:scale-100";

export const settingsButton = cn(
  "inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground cursor-pointer hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-muted disabled:hover:text-foreground disabled:active:scale-100",
  settingsTransition,
  settingsPress,
);
export const settingsButtonDanger =
  "hover:border-destructive/40 hover:bg-destructive/[0.12] hover:text-destructive";

export const settingsFieldFocus = cn(
  "outline-none transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  "hover:border-foreground/20 focus-visible:border-foreground/40 focus-visible:bg-background",
);
export const settingsTextInput = cn(
  "min-h-[30px] w-[min(250px,48%)] rounded-lg border border-border bg-muted px-2.5 py-[5px] text-xs text-foreground max-[620px]:w-full",
  settingsFieldFocus,
);

export const settingsToggleInput = cn(
  "h-[18px] w-8 flex-none cursor-pointer appearance-none rounded-full bg-foreground/[0.14] outline-none",
  "transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  "hover:bg-foreground/[0.2] focus-visible:bg-foreground/[0.28]",
  "checked:bg-foreground checked:hover:bg-foreground/90 checked:focus-visible:bg-foreground/75",
  "after:m-0.5 after:block after:h-3.5 after:w-3.5 after:rounded-full after:bg-foreground/85 after:shadow-[0_1px_2px_hsl(var(--scrim)/0.25)] after:content-['']",
  "after:transition-[transform,width,background-color] after:duration-200 after:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:after:transition-[background-color]",
  "active:after:w-[17px] checked:after:translate-x-3.5 checked:after:bg-background checked:active:after:translate-x-[11px]",
  "disabled:cursor-default disabled:opacity-50 disabled:active:after:w-3.5 disabled:checked:active:after:translate-x-3.5",
);

type ToggleProps = {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  visualization?: ReactNode;
};

export function SettingsHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={settingsSectionHeading}>
      <h1 className="m-0 text-2xl font-semibold tracking-[-0.025em] leading-[1.2]">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export function SettingToggle({ label, detail, checked, onChange, visualization }: ToggleProps) {
  return (
    <label className={cn(settingsRow, "cursor-pointer", visualization && "items-start")}>
      <span className={settingsRowLabel}>
        {label}
        <span className={settingsRowDescription}>{detail}</span>
        {visualization ? <span className="mt-3 block cursor-default">{visualization}</span> : null}
      </span>
      <input
        type="checkbox"
        data-directional-focus
        className={settingsToggleInput}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

const CARD_PICKER_SELECTION_KEYS = ["ArrowLeft", "ArrowRight"];

/**
 * @name settingsCardTone
 * @description Border and fill for a selectable settings card. Focus deepens
 * the border and the fill instead of drawing a ring, so a focused card reads
 * as the same card, lit.
 *
 * @example
 * <button className={cn(base, settingsCardTone(active))} />
 */
export function settingsCardTone(active: boolean): string {
  return active
    ? "border-foreground/60 bg-accent/40 focus-visible:border-foreground/80 focus-visible:[--focus-fill:hsl(var(--accent)/0.45)]"
    : "border-border/60 bg-card/30 hover:border-border focus-visible:border-foreground/35 focus-visible:[--focus-fill:hsl(var(--accent)/0.3)]";
}

export type CardPickerOption<TValue extends string> = {
  value: TValue;
  label: string;
  preview: ReactNode;
};

type CardPickerProps<TValue extends string> = {
  label: string;
  detail: string;
  value: TValue;
  options: readonly CardPickerOption<TValue>[];
  onChange: (value: TValue) => void;
};

export function SettingCardPicker<TValue extends string>({
  label,
  detail,
  value,
  options,
  onChange,
}: CardPickerProps<TValue>) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!CARD_PICKER_SELECTION_KEYS.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    const next = options[(index + delta + options.length) % options.length];
    if (!next) {
      return;
    }
    onChange(next.value);
    event.currentTarget.querySelector<HTMLElement>(`[data-option-value="${next.value}"]`)?.focus();
  }

  return (
    <div className="border-b border-[hsl(var(--border)/0.58)] py-[11px] text-[13px] last:border-b-0">
      <span className={settingsRowLabel}>
        {label}
        <span className={settingsRowDescription}>{detail}</span>
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-3 grid grid-cols-3 gap-2 max-[480px]:grid-cols-1"
        onKeyDown={handleKeyDown}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              data-option-value={option.value}
              data-directional-focus={active ? "" : undefined}
              tabIndex={active ? 0 : -1}
              className={cn(
                "cursor-pointer rounded-lg border p-1.5 text-left",
                settingsTransition,
                settingsPress,
                settingsCardTone(active),
              )}
              onClick={() => onChange(option.value)}
            >
              <span className="flex h-14 items-center justify-center overflow-hidden rounded-md bg-muted/50">
                {option.preview}
              </span>
              <span className="mt-1.5 flex min-h-4 items-center justify-between px-1">
                <span className="text-[11px] font-medium">{option.label}</span>
                {active && <CheckIcon size={12} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
