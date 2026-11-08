import { useContext, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { cn } from "@/shared/styling/class-names";
import { sectionLabelClass } from "@/shared/ui/section-header";
import {
  LedgerGroupMatchContext,
  ledgerGroupDomId,
  useSettingsLedger,
} from "@/shared/ui/settings-ledger";

export const settingsSection = "w-full";
export const settingsGroup = "mb-9";
export const settingsGroupTitle = cn("mb-2.5", sectionLabelClass);
export const settingsGroupHint = "mb-3 text-xs text-theme-secondary";
export const settingsSubheading = "m-0 pt-3 pb-1 text-xs font-medium text-theme-secondary";

export const settingsRow =
  "flex min-h-12 items-center justify-between gap-5 border-b border-theme-divider/85 py-2.5 text-[13px] last:border-b-0 max-[620px]:flex-wrap max-[620px]:gap-y-3";
export const settingsInputRow = "max-[620px]:flex-col max-[620px]:items-start";
export const settingsRowLabel =
  "flex min-w-0 max-w-[420px] flex-col gap-[3px] font-[450] max-[620px]:flex-[1_1_220px]";
export const settingsRowDescription = "text-xs font-normal leading-[1.5] text-theme-secondary";
export const settingsRowDetail =
  "font-mono text-[11px] font-normal text-theme-secondary [overflow-wrap:anywhere]";

export const settingsTransition =
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]";
export const settingsPress = "active:scale-[0.97] motion-reduce:active:scale-100";

export const settingsButton = cn(
  "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-theme-btn-outline bg-background px-[11px] text-[12.5px] text-foreground cursor-pointer hover:bg-theme-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-background disabled:active:scale-100",
  settingsTransition,
  settingsPress,
);
export const settingsButtonDanger =
  "text-destructive border-destructive/40 hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive";
export const settingsButtonPrimary =
  "border-accent-ink bg-accent-ink text-accent-ink-foreground hover:bg-accent-ink/85 disabled:hover:bg-accent-ink";

export const settingsFieldFocus = cn(
  "outline-none transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  "hover:border-theme-btn-outline focus-visible:border-ring",
);
export const settingsTextInput = cn(
  "min-h-[30px] w-[min(240px,48%)] rounded-[7px] border border-border bg-background px-2.5 py-[5px] text-[12.5px] text-foreground placeholder:text-theme-dim disabled:opacity-55 max-[620px]:w-full",
  settingsFieldFocus,
);

export const settingsToggleInput = cn(
  "h-[18px] w-8 flex-none cursor-pointer appearance-none rounded-full bg-theme-btn-outline outline-none",
  "transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  "hover:bg-theme-active focus-visible:bg-theme-active",
  "checked:bg-accent-ink checked:hover:bg-accent-ink/90 checked:focus-visible:bg-accent-ink/75",
  "after:m-0.5 after:block after:h-3.5 after:w-3.5 after:rounded-full after:bg-background after:shadow-[0_1px_2px_hsl(var(--scrim)/0.25)] after:content-['']",
  "after:transition-[transform,width,background-color] after:duration-200 after:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:after:transition-[background-color]",
  "active:after:w-[17px] checked:after:translate-x-3.5 checked:after:bg-accent-ink-foreground checked:active:after:translate-x-[11px]",
  "disabled:cursor-default disabled:opacity-50 disabled:active:after:w-3.5 disabled:checked:active:after:translate-x-3.5",
);

export const settingsSegmentGroup =
  "inline-flex shrink-0 rounded-lg border border-border bg-theme-deep p-0.5";
export const settingsSegmentButton = cn(
  "cursor-pointer rounded-md border-0 bg-transparent px-2.5 py-1 text-xs text-theme-secondary hover:text-foreground aria-checked:bg-theme-active aria-checked:text-foreground",
  settingsTransition,
);

type GroupProps = {
  id: string;
  title: string;
  hint?: ReactNode;
  preview?: ReactNode;
  tone?: "danger";
  keywords?: string;
  children: ReactNode;
};

export function SettingsGroup({ id, title, hint, preview, tone, children }: GroupProps) {
  const ledger = useSettingsLedger();
  const ref = useRef<HTMLElement>(null);
  const registry = ledger?.registry ?? null;
  const match = ledger?.search ? ledger.search.get(id) : null;
  const hidden = ledger?.search ? match === undefined : false;
  const headingId = ledger ? `${ledgerGroupDomId(ledger.sectionId, id)}-title` : undefined;

  useLayoutEffect(() => {
    const element = ref.current;
    if (hidden || !element || !registry) return;
    return registry.register({ id, title, element });
  }, [registry, id, title, hidden]);

  if (hidden) {
    return null;
  }

  return (
    <section
      ref={ref}
      id={ledger ? ledgerGroupDomId(ledger.sectionId, id) : undefined}
      data-settings-group={id}
      aria-labelledby={headingId}
      className="grid scroll-mt-3 grid-cols-[148px_minmax(0,1fr)] gap-x-6 border-t border-theme-divider/85 pt-[22px] pb-2 first:border-t-0 first:pt-3.5 max-[620px]:grid-cols-1 max-[620px]:gap-y-2"
    >
      <div className="sticky top-4 self-start max-[620px]:static">
        <h2
          id={headingId}
          className={cn(
            "m-0 text-[13px] font-medium tracking-[-0.005em]",
            tone === "danger" && "text-destructive",
          )}
        >
          {ledger?.search ? (
            <span className="block text-xs font-normal text-theme-secondary">
              {ledger.sectionLabel}
            </span>
          ) : null}
          {title}
        </h2>
        {hint ? (
          <p className="mt-1 mb-0 text-xs leading-[1.45] text-theme-secondary">{hint}</p>
        ) : null}
        {preview && !ledger?.search ? (
          <div className="mt-3 max-[620px]:hidden">{preview}</div>
        ) : null}
      </div>
      <div className="min-w-0">
        <LedgerGroupMatchContext.Provider value={match ?? null}>
          {children}
        </LedgerGroupMatchContext.Provider>
      </div>
    </section>
  );
}

function ChangedDot({ changed }: { changed: boolean }) {
  return (
    <span
      aria-hidden="true"
      title="Changed from default"
      className={cn(
        "size-[5px] flex-none rounded-full bg-accent-ink transition-opacity duration-150",
        changed ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

type RowProps = {
  label: string;
  detail?: ReactNode;
  notes?: ReactNode;
  heading?: ReactNode;
  changed?: boolean;
  as?: "div" | "label" | "li";
  htmlFor?: string;
  stack?: boolean;
  hideLabel?: boolean;
  className?: string;
  children?: ReactNode;
};

export function SettingsRow({
  label,
  detail,
  notes,
  heading,
  changed,
  as: Tag = "div",
  htmlFor,
  stack,
  hideLabel,
  className,
  children,
}: RowProps) {
  const match = useContext(LedgerGroupMatchContext);
  if (match && !match.has(label)) {
    return null;
  }
  return (
    <Tag
      htmlFor={Tag === "label" ? htmlFor : undefined}
      data-settings-row={label}
      className={cn(
        settingsRow,
        stack && "flex-col items-stretch gap-3",
        Tag === "label" && "cursor-pointer",
        className,
      )}
    >
      {hideLabel ? null : (
        <span className={cn(settingsRowLabel, stack && "max-w-none")}>
          <span className="flex min-w-0 items-center gap-[7px]">
            {heading ?? label}
            {changed === undefined ? null : <ChangedDot changed={changed} />}
          </span>
          {detail ? <span className={settingsRowDescription}>{detail}</span> : null}
          {notes}
        </span>
      )}
      {children}
    </Tag>
  );
}

type ToggleProps = {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  changed?: boolean;
  disabled?: boolean;
};

export function SettingToggle({
  label,
  detail,
  checked,
  onChange,
  changed,
  disabled,
}: ToggleProps) {
  return (
    <SettingsRow as="label" label={label} detail={detail} changed={changed}>
      <input
        type="checkbox"
        data-directional-focus
        className={settingsToggleInput}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </SettingsRow>
  );
}

const SEGMENT_KEYS = ["ArrowLeft", "ArrowRight"];

export type SegmentOption<TValue extends string> = {
  value: TValue;
  label: string;
};

type SegmentedProps<TValue extends string> = {
  label: string;
  value: TValue;
  options: readonly SegmentOption<TValue>[];
  onChange: (value: TValue) => void;
};

export function SegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<TValue>) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!SEGMENT_KEYS.includes(event.key)) {
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
    <div
      role="radiogroup"
      aria-label={label}
      className={settingsSegmentGroup}
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
            className={settingsSegmentButton}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type SegmentedRowProps<TValue extends string> = SegmentedProps<TValue> & {
  detail: string;
  changed?: boolean;
};

export function SettingSegmented<TValue extends string>({
  label,
  detail,
  value,
  options,
  onChange,
  changed,
}: SegmentedRowProps<TValue>) {
  return (
    <SettingsRow label={label} detail={detail} changed={changed}>
      <SegmentedControl label={label} value={value} options={options} onChange={onChange} />
    </SettingsRow>
  );
}
