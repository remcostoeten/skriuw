import { useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { detectPlatform } from "@remcostoeten/use-shortcut/constants";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { matchesShortcut, parseShortcut } from "@remcostoeten/use-shortcut/parser";
import { SearchIcon } from "@/shared/icons";
import { cn } from "@/shared/lib/utils";
import { Dialog } from "@/shared/ui/dialog";
import {
  effectiveShortcutKeys,
  sameShortcutOverrides,
  shortcutDefinition,
  shortcutOverridesFromSettings,
} from "@/shortcuts/bindings";
import type { ShortcutPlatform } from "@/shortcuts/definitions";
import {
  shortcutHelpGroups,
  shortcutHelpRowCount,
  type ShortcutHelpCombo,
  type ShortcutHelpRow,
} from "@/shortcuts/help-model";
import {
  settingsGroup,
  settingsGroupTitle,
  settingsRow,
} from "@/shell/settings/settings-shared";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";

type Props = {
  store: RendererStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * `mod+/` cheat sheet. Every row comes from `SHORTCUT_DEFINITIONS` through the
 * help model, so rebound combos, alternates, sequences, and platform-specific
 * defaults are always what the overlay shows. Mounts fresh on each open, which
 * also resets the filter; the native dialog returns focus where it came from.
 */
export function ShortcutHelpOverlay({ store, open, onOpenChange }: Props) {
  if (!open) {
    return null;
  }
  return <ShortcutHelpDialog store={store} onOpenChange={onOpenChange} />;
}

function Kbd({ children, ...rest }: ComponentProps<"kbd">) {
  return (
    <kbd
      className="flex-none rounded border border-border bg-muted px-[5px] py-px font-mono text-[10px] text-muted-foreground"
      {...rest}
    >
      {children}
    </kbd>
  );
}

function ComboSteps({ combo }: { combo: ShortcutHelpCombo }) {
  return (
    <span className="flex flex-none items-center gap-1">
      {combo.steps.map((step, index) => (
        <span key={`${step}-${index}`} className="flex items-center gap-1">
          {index > 0 && (
            <span className="text-[10px] text-muted-foreground/70">then</span>
          )}
          <Kbd>{step}</Kbd>
        </span>
      ))}
    </span>
  );
}

function HelpRow({ row }: { row: ShortcutHelpRow }) {
  return (
    <div className={settingsRow}>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate">{row.label}</span>
        {row.when && (
          <span className="flex-none text-[11px] text-muted-foreground/80">
            {row.when}
          </span>
        )}
      </span>
      <span className="flex flex-none items-center gap-2">
        {row.combos.map((combo, index) => (
          <span key={combo.keys} className="flex items-center gap-2">
            {index > 0 && (
              <span className="text-[10px] text-muted-foreground/70">or</span>
            )}
            <ComboSteps combo={combo} />
          </span>
        ))}
      </span>
    </div>
  );
}

type DialogProps = {
  store: RendererStore;
  onOpenChange: (open: boolean) => void;
};

function ShortcutHelpDialog({ store, onOpenChange }: DialogProps) {
  const [query, setQuery] = useState("");
  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameShortcutOverrides,
  );
  const platform = detectPlatform() as ShortcutPlatform;
  const toggleKeys = effectiveShortcutKeys(
    shortcutDefinition("showShortcutHelp"),
    overrides,
  );
  const groups = useMemo(
    () => shortcutHelpGroups({ overrides, platform, query }),
    [overrides, platform, query],
  );

  function handleKeyDown(event: KeyboardEvent): void {
    if (matchesShortcut(event, parseShortcut(toggleKeys))) {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      className={cn(
        "w-[min(760px,calc(100vw-48px))] h-[min(680px,calc(100vh-64px))] max-h-[calc(100vh-64px)]",
        "max-[620px]:h-[calc(100vh-24px)] max-[620px]:w-[calc(100vw-24px)] max-[620px]:max-h-[calc(100vh-24px)]",
      )}
      onKeyDown={handleKeyDown}
      showHeader={false}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-none items-center gap-2.5 border-b border-border px-3.5 py-3 text-muted-foreground">
          <SearchIcon size={16} aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-foreground outline-none [&::-webkit-search-cancel-button]:hidden placeholder:text-muted-foreground"
            placeholder="Filter shortcuts by name or keys..."
            aria-label="Filter shortcuts"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <Kbd>{formatShortcut(toggleKeys, platform)}</Kbd>
          <Kbd>Esc</Kbd>
        </div>
        <div className="min-h-0 flex-auto overflow-y-auto px-4 pt-3 pb-6">
          {shortcutHelpRowCount(groups) === 0 ? (
            <p className="px-1 py-10 text-center text-[13px] text-muted-foreground">
              No shortcuts match “{query.trim()}”.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.group} className={settingsGroup}>
                <h3 className={settingsGroupTitle}>{group.group}</h3>
                {group.rows.map((row) => (
                  <HelpRow key={row.id} row={row} />
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
