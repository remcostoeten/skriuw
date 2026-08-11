import { useState, type ReactNode } from "react";
import { useAuth } from "@remcostoeten/auth-drawer";
import { updateSetting } from "@/actions/settings";
import {
  ArrowUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudIcon,
  CloudOffIcon,
  DatabaseIcon,
  InfoIcon,
  KeyboardIcon,
  LogOutIcon,
  PaletteIcon,
  RefreshIcon,
  SettingsIcon,
} from "@/shared/icons";
import { AppIcon } from "@/shared/icons/app-icon";
import { cn } from "@/shared/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tooltip } from "@/shared/ui/tooltip";
import { useMediaQuery } from "@/shared/ui/use-media-query";
import { useShortcutHints } from "@/shortcuts/hints";
import type { RendererStore } from "@/store/types";
import {
  accountDisplayName,
  accountInitials,
  accountMenuPanelTitle,
  activeThemeLabel,
  themeMenuOptions,
  COMPACT_MENU_QUERY,
  type AccountMenuPanel,
} from "./account-menu-model";
import { railActiveClass, railIconButtonClass, railInactiveClass } from "./rail-styles";
import { selectTheme } from "@/shell/settings/selectors";
import type { SectionId } from "@/shell/settings/sections";
import { syncSummary, syncTone } from "@/shell/settings/sync-status";
import { SYNC_POLL_AMBIENT_MS, useWorkspaceSync } from "@/shell/settings/use-workspace-sync";
import { useRendererSelector } from "@/store/use-renderer-selector";

const TRANSFER_COMMANDS = [
  { id: "import-markdown-file", label: "Import markdown file…" },
  { id: "import-markdown", label: "Import notes from folder…" },
  { id: "import-provider-export", label: "Import provider export…" },
  { id: "export-note-markdown", label: "Export note as Markdown…" },
  { id: "export-workspace-markdown", label: "Export workspace…" },
] as const;

const MENU_SHORTCUT_IDS = ["openSettings", "showShortcutHelp"] as const;

const TONE_DOT_CLASS = {
  synced: "bg-success",
  syncing: "bg-foreground/70 motion-safe:animate-pulse",
  offline: "bg-muted-foreground",
  attention: "bg-warning",
} as const;

const avatarClass =
  "flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] font-medium tracking-[0.02em] transition-colors duration-200 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:text-[13px]";

type ThemeOptionsProps = {
  store: RendererStore;
  theme: string;
};

function ThemeOptions({ store, theme }: ThemeOptionsProps) {
  return themeMenuOptions().map((option) => (
    <DropdownMenuCheckboxItem
      key={option.id}
      checked={theme === option.id}
      onSelect={() => updateSetting(store, "theme", option.id)}
    >
      {option.label}
    </DropdownMenuCheckboxItem>
  ));
}

type TransferItemsProps = {
  onRunCommand: (commandId: string) => void;
  isCommandEnabled: (commandId: string) => boolean;
};

function TransferItems({ onRunCommand, isCommandEnabled }: TransferItemsProps) {
  return TRANSFER_COMMANDS.map((command) => (
    <DropdownMenuItem
      key={command.id}
      disabled={!isCommandEnabled(command.id)}
      onSelect={() => onRunCommand(command.id)}
    >
      {command.label}
    </DropdownMenuItem>
  ));
}

type PanelBackRowProps = {
  panel: AccountMenuPanel;
  onBack: () => void;
};

function PanelBackRow({ panel, onBack }: PanelBackRowProps) {
  return (
    <>
      <DropdownMenuItem
        className="text-foreground"
        onSelect={(event) => {
          event.preventDefault();
          onBack();
        }}
      >
        <ChevronLeftIcon size={15} className="shrink-0" aria-hidden="true" />
        {accountMenuPanelTitle(panel)}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}

type PanelLinkRowProps = {
  panel: AccountMenuPanel;
  detail?: string;
  onOpen: (panel: AccountMenuPanel) => void;
  children: ReactNode;
};

/** Compact stand-in for a submenu trigger: opens the panel in place. */
function PanelLinkRow({ panel, detail, onOpen, children }: PanelLinkRowProps) {
  return (
    <DropdownMenuItem
      aria-haspopup="menu"
      onSelect={(event) => {
        event.preventDefault();
        onOpen(panel);
      }}
    >
      {children}
      <span className="ml-auto flex min-w-0 items-center gap-1.5 pl-2">
        {detail ? <span className="truncate text-[11px] text-foreground/45">{detail}</span> : null}
        <ChevronRightIcon size={13} className="shrink-0" aria-hidden="true" />
      </span>
    </DropdownMenuItem>
  );
}

type Props = {
  store: RendererStore;
  /** Opens the settings dialog on a specific section. */
  onOpenSettings: (section: SectionId) => void;
  onShowShortcutHelp: () => void;
  onRunCommand: (commandId: string) => void;
  isCommandEnabled: (commandId: string) => boolean;
  settingsOpen: boolean;
};

/**
 * Bottom slot of the navigation rail. Signed out it stays the plain settings
 * gear, so a local-only workspace keeps its one-click route into settings.
 * Signed in it becomes the account avatar: identity, live sync state, and the
 * workspace entries that would otherwise each need their own rail icon.
 *
 * Narrow viewports anchor the menu above the trigger and replace its fly-out
 * submenus with panels that take over the same surface.
 */
export function AccountMenu({
  store,
  onOpenSettings,
  onShowShortcutHelp,
  onRunCommand,
  isCommandEnabled,
  settingsOpen,
}: Props) {
  const { user } = useAuth();
  const sync = useWorkspaceSync(SYNC_POLL_AMBIENT_MS);
  const theme = useRendererSelector(store, selectTheme);
  const hints = useShortcutHints(store, MENU_SHORTCUT_IDS);
  const compact = useMediaQuery(COMPACT_MENU_QUERY);
  const [panel, setPanel] = useState<AccountMenuPanel>("root");
  if (!user) {
    return (
      <Tooltip label="Settings" side="right" shortcut={hints.openSettings}>
        <button
          type="button"
          className={cn(
            railIconButtonClass,
            settingsOpen ? railActiveClass : railInactiveClass,
          )}
          aria-label="Settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => onOpenSettings("appearance")}
        >
          <AppIcon name="settings" size={18} />
        </button>
      </Tooltip>
    );
  }

  const name = accountDisplayName(user.name, user.email);
  const initials = accountInitials(user.name, user.email);
  const tone = syncTone(sync.status);
  const StatusIcon = tone === "offline" ? CloudOffIcon : tone === "syncing" ? RefreshIcon : CloudIcon;
  const syncAction = sync.status.state === "blocked" ? sync.retry : sync.pause;
  const syncActionLabel = sync.status.state === "blocked" ? "Retry sync" : "Pause sync";
  const syncPaused = sync.status.state === "localOnly";
  const activePanel = compact ? panel : "root";

  return (
    <DropdownMenu onOpenChange={() => setPanel("root")}>
      <Tooltip label={name} side="right">
        <DropdownMenuTrigger
          className={cn(
            avatarClass,
            "relative border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground/92",
            "hover:border-foreground/35 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            "data-[state=open]:border-foreground/35 data-[state=open]:bg-sidebar-accent/75 data-[state=open]:text-sidebar-accent-foreground",
          )}
          aria-label={`Account: ${name}`}
        >
          {initials}
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-sm border border-sidebar",
              TONE_DOT_CLASS[tone],
            )}
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent
        side={compact ? "top" : "right"}
        align={compact ? "start" : "end"}
        collisionPadding={12}
        className={cn(
          "w-[268px]",
          compact && "max-h-[70vh] w-[calc(100vw-24px)] max-w-[320px] overflow-y-auto overscroll-contain",
        )}
      >
        {activePanel === "appearance" ? (
          <>
            <PanelBackRow panel="appearance" onBack={() => setPanel("root")} />
            <ThemeOptions store={store} theme={theme} />
          </>
        ) : null}
        {activePanel === "transfer" ? (
          <>
            <PanelBackRow panel="transfer" onBack={() => setPanel("root")} />
            <TransferItems onRunCommand={onRunCommand} isCommandEnabled={isCommandEnabled} />
          </>
        ) : null}
        {activePanel === "root" ? (
          <>
            <div className="flex items-center gap-3 px-2 py-2.5">
              <span
                className={cn(avatarClass, "shrink-0 border-border bg-muted text-foreground")}
                aria-hidden="true"
              >
                {initials}
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="truncate text-[13px] leading-none text-foreground">{name}</span>
                <span className="truncate text-[11px] leading-none text-muted-foreground">
                  {user.email}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:pointer-events-none disabled:opacity-60 pointer-coarse:min-h-11 pointer-coarse:text-xs"
              disabled={sync.pending}
              onClick={syncPaused ? sync.resume : syncAction}
            >
              <span className="flex min-w-0 items-center gap-2">
                <StatusIcon
                  size={13}
                  className={cn("shrink-0", tone === "syncing" && "motion-safe:animate-spin")}
                  aria-hidden="true"
                />
                <span className="truncate">{sync.error ?? syncSummary(sync.status)}</span>
              </span>
              <span className="shrink-0 text-foreground/45">
                {syncPaused ? "Resume" : syncActionLabel}
              </span>
            </button>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenSettings("appearance")}>
              <SettingsIcon size={15} className="shrink-0" aria-hidden="true" />
              Settings
              {hints.openSettings ? <DropdownMenuShortcut keys={hints.openSettings} /> : null}
            </DropdownMenuItem>
            {compact ? (
              <PanelLinkRow panel="appearance" detail={activeThemeLabel(theme)} onOpen={setPanel}>
                <PaletteIcon size={15} className="shrink-0" aria-hidden="true" />
                Appearance
              </PanelLinkRow>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PaletteIcon size={15} className="shrink-0" aria-hidden="true" />
                  Appearance
                  <span className="ml-auto truncate pl-2 text-[11px] text-foreground/45">
                    {activeThemeLabel(theme)}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[196px]">
                  <ThemeOptions store={store} theme={theme} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onShowShortcutHelp}>
              <KeyboardIcon size={15} className="shrink-0" aria-hidden="true" />
              Keyboard shortcuts
              {hints.showShortcutHelp ? (
                <DropdownMenuShortcut keys={hints.showShortcutHelp} />
              ) : null}
            </DropdownMenuItem>
            {compact ? (
              <PanelLinkRow panel="transfer" onOpen={setPanel}>
                <ArrowUpDownIcon size={15} className="shrink-0" aria-hidden="true" />
                Import and export
              </PanelLinkRow>
            ) : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowUpDownIcon size={15} className="shrink-0" aria-hidden="true" />
                  Import and export
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[236px]">
                  <TransferItems onRunCommand={onRunCommand} isCommandEnabled={isCommandEnabled} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem onSelect={() => onOpenSettings("data")}>
              <DatabaseIcon size={15} className="shrink-0" aria-hidden="true" />
              Data and recovery
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenSettings("about")}>
              <InfoIcon size={15} className="shrink-0" aria-hidden="true" />
              Help and feedback
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={sync.signOut}>
              <LogOutIcon size={15} className="shrink-0" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
