import type { ReactNode } from "react";
import { updateSetting } from "../../actions/settings";
import { projectSettings } from "../../settings/settings-model";
import type { EditableSettings, SettingsViewModel } from "../../settings/settings-model";
import { cn } from "../../shared/lib/utils";
import { useRendererSelector } from "../../store/use-renderer-selector";
import type { RendererStore } from "../../store/types";
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
export const settingsButtonDanger = "text-destructive hover:text-destructive";

const settingsFieldFocus =
  "focus-visible:border-foreground/45 focus-visible:shadow-[0_0_0_2px_hsl(var(--background)),0_0_0_3px_hsl(var(--foreground)/0.25)]";
export const settingsSelect = cn(
  "min-h-[30px] min-w-[148px] rounded-lg border border-border bg-muted py-1 pr-7 pl-[9px] text-xs text-foreground",
  settingsFieldFocus,
);
export const settingsTextInput = cn(
  "min-h-[30px] w-[min(250px,48%)] rounded-lg border border-border bg-muted px-2.5 py-[5px] text-xs text-foreground max-[620px]:w-full",
  settingsFieldFocus,
);

const settingsToggleInput = cn(
  "h-[17px] w-[30px] flex-none cursor-pointer appearance-none rounded-full border border-border bg-muted transition-colors duration-[120ms] motion-reduce:duration-[1ms]",
  "checked:border-foreground/45 checked:bg-foreground/[0.22]",
  "after:m-0.5 after:block after:h-[11px] after:w-[11px] after:rounded-full after:bg-muted-foreground after:transition-transform after:duration-[120ms] after:content-[''] motion-reduce:after:duration-[1ms]",
  "checked:after:translate-x-[13px] checked:after:bg-foreground",
  settingsFieldFocus,
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
