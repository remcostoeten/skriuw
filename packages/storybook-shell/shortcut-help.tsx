import { useEffect, useRef } from "react";
import { formatShortcut, useStorybookConfig, type StorybookConfig } from "./config";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Row = {
  label: string;
  detail?: string;
  combos: readonly string[];
};

function shortcutRows({ labels, shortcuts, features }: StorybookConfig): Row[] {
  const sections = features.sectionShortcuts;
  const rows: (Row | false)[] = [
    features.search && shortcuts.search && { label: labels.helpSearch, combos: shortcuts.search },
    features.collapsibleSidebar &&
      shortcuts.toggleSidebar && { label: labels.helpSidebar, combos: shortcuts.toggleSidebar },
    features.jump &&
      shortcuts.jump && {
        label: labels.helpJump,
        detail: labels.helpJumpDetail,
        combos: shortcuts.jump,
      },
    sections && shortcuts.goToMain && { label: labels.helpMain, combos: shortcuts.goToMain },
    sections && shortcuts.goToUsage && { label: labels.helpUsage, combos: shortcuts.goToUsage },
    sections && shortcuts.goToApi && { label: labels.helpApi, combos: shortcuts.goToApi },
    sections && shortcuts.goToSource && { label: labels.helpSource, combos: shortcuts.goToSource },
    shortcuts.help && { label: labels.helpShortcuts, combos: shortcuts.help },
  ];
  return rows.filter((row): row is Row => Boolean(row) && (row as Row).combos.length > 0);
}

function Keys({ combo, then }: { combo: string; then: string }) {
  const steps = combo.split(" ");
  return (
    <span className="flex items-center gap-1">
      {steps.map((step, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <span className="text-[10px] text-muted-foreground">{then}</span>}
          <kbd className="min-w-5 rounded border border-border/70 bg-muted/40 px-1 text-center font-sans text-[11px] leading-5 text-foreground">
            {formatShortcut(step)}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/** "?" button in the top bar that opens a popover explaining every enabled shortcut. */
export function ShortcutHelp({ open, onOpenChange }: Props) {
  const config = useStorybookConfig();
  const { labels } = config;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rows = shortcutRows(config);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={labels.showShortcuts}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-keyshortcuts={config.shortcuts.help ? config.shortcuts.help.join(" ") : undefined}
        title={labels.showShortcuts}
        onClick={() => onOpenChange(!open)}
        className="grid size-7 place-items-center rounded-md border border-border/60 text-[12px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        ?
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={labels.shortcutsTitle}
          tabIndex={-1}
          className="absolute right-0 top-9 z-50 w-80 rounded-lg border border-border/60 bg-background p-1 text-[12px] text-foreground shadow-lg outline-none"
        >
          <h2 className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-muted-foreground">
            {labels.shortcutsTitle}
          </h2>
          <ul className="flex flex-col">
            {rows.map((row) => (
              <li
                key={row.label}
                className="flex flex-col gap-1 rounded-md px-2.5 py-1.5 hover:bg-muted/40"
              >
                <span className="flex items-center justify-between gap-3">
                  <span>{row.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {row.combos.map((combo) => (
                      <Keys key={combo} combo={combo} then={labels.sequenceSeparator} />
                    ))}
                  </span>
                </span>
                {row.detail && (
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {row.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
