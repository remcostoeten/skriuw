import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { updateSetting } from "@/store/actions/settings";
import { CheckIcon } from "@/shared/icons/static";
import { projectSettings } from "@/settings/settings-model";
import type { EditableSettings, SettingsViewModel } from "@/settings/settings-model";
import { cn } from "@/shared/lib/utils";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import { selectSettings } from "./selectors";

export type SectionProps = {
  store: RendererStore;
};

type EditableSettingsBinding = {
  settings: SettingsViewModel;
  change: <K extends keyof EditableSettings>(field: K, value: EditableSettings[K]) => void;
};

/** Subscribes a settings section to the settings document and exposes a typed field updater. */
export function useEditableSettings(store: RendererStore): EditableSettingsBinding {
  const document = useRendererSelector(store, selectSettings);
  const settings = projectSettings(document);
  function change<K extends keyof EditableSettings>(
    field: K,
    value: EditableSettings[K],
  ): void {
    updateSetting(store, field, value);
  }
  return { settings, change };
}

export const settingsSection = "mx-auto w-full max-w-[680px]";
export const settingsSectionHeading = "mb-8";
export const settingsGroup = "mb-6";
export const settingsGroupTitle =
  "mb-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70";
export const settingsGroupHint = "mb-3 text-xs text-muted-foreground/80";

export const settingsRow =
  "flex min-h-[42px] items-center justify-between gap-3 border-b border-[hsl(var(--border)/0.58)] py-[7px] text-[13px] last:border-b-0";
export const settingsInputRow = "max-[620px]:flex-col max-[620px]:items-start";
export const settingsRowLabel = "flex min-w-0 flex-col gap-[3px]";
export const settingsRowDescription = "text-[11px] leading-[1.35] text-muted-foreground";
export const settingsRowDetail =
  "font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]";

export const settingsButton =
  "inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-foreground cursor-pointer hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-muted disabled:hover:text-foreground";
export const settingsButtonDanger =
  "hover:border-destructive/40 hover:bg-destructive/[0.12] hover:text-destructive";

const settingsFieldFocus =
  "outline-none focus-visible:border-foreground/70 focus-visible:bg-accent/25";
export const settingsTextInput = cn(
  "min-h-[30px] w-[min(250px,48%)] rounded-lg border border-border bg-muted px-2.5 py-[5px] text-xs text-foreground max-[620px]:w-full",
  settingsFieldFocus,
);

const settingsToggleInput = cn(
  "h-[17px] w-[30px] flex-none cursor-pointer appearance-none rounded-full border border-border bg-muted transition-colors duration-[120ms] motion-reduce:duration-[1ms]",
  "checked:border-foreground/45 checked:bg-foreground/[0.22]",
  "after:m-0.5 after:block after:h-[11px] after:w-[11px] after:rounded-full after:bg-muted-foreground after:transition-transform after:duration-[120ms] after:content-[''] motion-reduce:after:duration-[1ms]",
  "checked:after:translate-x-[13px] checked:after:bg-foreground",
  "outline-none focus-visible:border-foreground/70",
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
        className={settingsToggleInput}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

const CARD_PICKER_ARROW_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

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
    if (!CARD_PICKER_ARROW_KEYS.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = options[(index + delta + options.length) % options.length];
    if (!next) {
      return;
    }
    onChange(next.value);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-option-value="${next.value}"]`)
      ?.focus();
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
              tabIndex={active ? 0 : -1}
              className={cn(
                "cursor-pointer rounded-lg border p-1.5 text-left",
                "transition-[border-color,background-color,transform] duration-150 ease-out motion-reduce:transition-none",
                "active:scale-[0.98] motion-reduce:active:scale-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-foreground/60 bg-accent/40"
                  : "border-border/60 bg-card/30 hover:border-border",
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
