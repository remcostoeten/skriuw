import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  FileText,
  FlaskConical,
  Folder,
  FolderOpen,
  Palette,
  PanelRight,
  PanelTopClose,
  PenLine,
  Search,
  Settings2,
  Sidebar,
  UnfoldVertical,
  Sparkles,
  Tag,
  Type,
  User,
} from "lucide-react";
import { LayoutContainer } from "./layout-container";
import { cn } from "@/shared/lib/utils";
import { RawLogo } from "@/shared/icons/logo";
import { DESKTOP_SIDEBAR_MIN_WIDTH } from "@/features/notes/constants";
import {
  NewFolderNoteIcon,
  NewNoteIcon,
} from "@/features/notes/components/sidebar/header-icons";

type WorkspaceLoadingVariant = "notes" | "journal";

function DataLine({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-sidebar-foreground/[0.075]", className)}
    />
  );
}

function StaticControl({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-7 items-center justify-center border border-sidebar-border/70 bg-sidebar-accent/25 text-sidebar-foreground/48",
        className,
      )}
    >
      {children}
    </div>
  );
}

function LoadingRail({ active }: { active: WorkspaceLoadingVariant }) {
  const itemClass =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-transparent";

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar/95 md:flex">
        <div className="flex w-full flex-col items-center">
          <div className="flex h-11 w-full items-center justify-center border-b border-sidebar-border">
            <RawLogo variant="sidebar" size={34} className="text-sidebar-foreground/92" />
          </div>
          <div className="mt-4 flex w-full flex-col items-center gap-4">
            <div
              className={cn(
                itemClass,
                active === "notes"
                  ? "bg-sidebar-accent/75 text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/52",
              )}
            >
              <FolderOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </div>
            <div
              className={cn(
                itemClass,
                active === "journal"
                  ? "bg-sidebar-accent/75 text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/52",
              )}
            >
              <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="mb-4 h-9 w-9 rounded-full border border-sidebar-border bg-sidebar"
        />
      </aside>
      <div aria-hidden="true" className="hidden w-14 shrink-0 md:block" />
    </>
  );
}

function SidebarDataRows({ variant }: { variant: WorkspaceLoadingVariant }) {
  const rows =
    variant === "journal"
      ? ["Today", "Yesterday", "This week", "Ideas", "Work log", "Private"]
      : ["Start here", "Inbox", "Projects", "Writing", "References", "Archive"];

  return (
    <div className="space-y-1.5">
      {rows.map((label, index) => {
        const Icon = variant === "journal" ? CalendarDays : index === 2 ? Folder : FileText;

        return (
          <div key={label} className="flex h-8 items-center gap-2 px-2 text-sidebar-foreground/36">
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.45} />
            <span className="text-[12px] leading-none">{label}</span>
            {index < 3 ? <DataLine className="ml-auto h-px w-8" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function SidebarHeaderIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60"
    >
      {children}
    </div>
  );
}

export function WorkspaceSidebarSkeleton({ variant }: { variant: WorkspaceLoadingVariant }) {
  return (
    <div
      className="hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col"
      style={{ width: DESKTOP_SIDEBAR_MIN_WIDTH, minWidth: DESKTOP_SIDEBAR_MIN_WIDTH }}
    >
      <div className="flex h-11 items-center justify-between overflow-hidden border-b border-sidebar-border px-3">
        <div className="flex h-full w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-2.5 w-full justify-between">
            <SidebarHeaderIcon>
              <NewNoteIcon className="h-4 w-4" />
            </SidebarHeaderIcon>
            <SidebarHeaderIcon>
              <NewFolderNoteIcon className="h-4 w-4" />
            </SidebarHeaderIcon>
            <SidebarHeaderIcon>
              <PanelTopClose className="h-4 w-4" strokeWidth={1.5} />
            </SidebarHeaderIcon>
            <SidebarHeaderIcon>
              <UnfoldVertical className="h-4 w-4" strokeWidth={1.5} />
            </SidebarHeaderIcon>
            <SidebarHeaderIcon>
              <Search className="h-4 w-4" strokeWidth={1.5} />
            </SidebarHeaderIcon>
          </div>
        </div>
      </div>
      <div className="space-y-5 p-3">
        <div className="space-y-2">
          <div className="px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/32">
            {variant === "journal" ? "Recent entries" : "Workspace"}
          </div>
          <SidebarDataRows variant={variant} />
        </div>
      </div>
    </div>
  );
}

export function WorkspaceContentSkeleton({ variant }: { variant: WorkspaceLoadingVariant }) {
  if (variant === "journal") {
    return (
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
        <div className="flex h-11 items-center border-b border-sidebar-border border-l bg-sidebar px-3">
          <div className="flex items-center gap-2">
            <StaticControl className="w-7">
              <Sidebar className="h-4 w-4" strokeWidth={1.5} />
            </StaticControl>
            <StaticControl className="w-7">
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </StaticControl>
            <StaticControl className="w-7">
              <CalendarDays className="h-4 w-4" strokeWidth={1.5} />
            </StaticControl>
          </div>
          <div className="flex flex-1 justify-center gap-3 text-sm">
            <span className="text-sidebar-foreground/50">Journal</span>
            <span className="font-medium text-sidebar-foreground/68">Loading entry data</span>
          </div>
          <StaticControl className="w-24">
            <Type className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="text-[11px]">Editor</span>
          </StaticControl>
        </div>
        <div className="flex flex-1 flex-col px-[max(2rem,8vw)] py-10">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/36">
              Journal entry
            </div>
            <div className="mt-3 h-7 text-[24px] font-semibold tracking-[-0.04em] text-foreground/28">
              Today
            </div>
          </div>
          <div className="mt-10 max-w-4xl space-y-5">
            <DataLine className="h-px w-full bg-foreground/[0.08]" />
            <DataLine className="h-px w-11/12 bg-foreground/[0.07]" />
            <DataLine className="h-px w-2/3 bg-foreground/[0.06]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
      <div className="flex h-11 items-center justify-between border-b border-sidebar-border bg-sidebar px-3">
        <div className="flex items-center gap-2">
          <StaticControl className="w-7">
            <Sidebar className="h-4 w-4" strokeWidth={1.5} />
          </StaticControl>
          <StaticControl className="w-7">
            <PanelRight className="h-4 w-4" strokeWidth={1.5} />
          </StaticControl>
        </div>
        <div className="max-w-[248px] truncate text-[13px] font-medium text-sidebar-foreground/58">
          Loading note data
        </div>
        <StaticControl className="w-20">
          <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        </StaticControl>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col px-[max(2rem,8vw)] py-10">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/36">
            Current note
          </div>
          <div className="mt-3 h-8 text-[28px] font-semibold tracking-[-0.05em] text-foreground/25">
            Untitled
          </div>
          <div className="mt-10 max-w-4xl space-y-5">
            <DataLine className="h-px w-full bg-foreground/[0.08]" />
            <DataLine className="h-px w-10/12 bg-foreground/[0.07]" />
            <DataLine className="h-px w-7/12 bg-foreground/[0.06]" />
          </div>
        </div>
        <div className="hidden w-72 shrink-0 border-l border-sidebar-border bg-sidebar/80 p-4 lg:block">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/32">
            Details
          </div>
          <div className="mt-5 space-y-4">
            <DataLine className="h-px w-full" />
            <DataLine className="h-px w-5/6" />
            <DataLine className="h-px w-3/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsLoadingRail() {
  const itemClass =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-sidebar-foreground/52";
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar/95 md:flex">
        <div className="flex w-full flex-col items-center">
          <div className="flex h-11 w-full items-center justify-center border-b border-sidebar-border">
            <RawLogo variant="sidebar" size={34} className="text-sidebar-foreground/92" />
          </div>
          <div className="mt-4 flex w-full flex-col items-center gap-4">
            <div className={itemClass}>
              <FolderOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </div>
            <div className={itemClass}>
              <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="mb-4 h-9 w-9 rounded-full border border-sidebar-border bg-sidebar"
        />
      </aside>
      <div aria-hidden="true" className="hidden w-14 shrink-0 md:block" />
    </>
  );
}

export function SettingsLoadingShell() {
  const items: Array<{ label: string; Icon: typeof User; active?: boolean }> = [
    { label: "Account", Icon: User, active: true },
    { label: "Appearance", Icon: Palette },
    { label: "Editor", Icon: PenLine },
    { label: "AI", Icon: Sparkles },
    { label: "Tags", Icon: Tag },
    { label: "Experimental", Icon: FlaskConical },
  ];

  return (
    <LayoutContainer className="bg-background">
      {/* Mobile skeleton — iOS-style settings list */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <header
          className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-2 backdrop-blur"
          style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
        >
          <div className="flex h-12 w-20 items-center px-2 text-[15px] font-medium text-muted-foreground/60">
            Back
          </div>
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground/80">
            Settings
          </h1>
          <div className="h-12 w-20" aria-hidden="true" />
        </header>
        <div
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
        >
          <ul aria-hidden="true" className="divide-y divide-border border-b border-border">
            {items.map(({ label, Icon }) => (
              <li key={label}>
                <div className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-muted/40 text-foreground/60">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-medium leading-tight text-foreground/70">
                      {label}
                    </span>
                    <DataLine className="mt-1.5 h-2.5 w-32 max-w-full" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Desktop skeleton */}
      <div className="relative hidden min-h-0 flex-1 overflow-hidden md:flex">
        <SettingsLoadingRail />

        <div
          className="hidden shrink-0 flex-col border-r border-border bg-background md:flex"
          style={{ width: 220 }}
        >
          <div className="flex h-11 items-center border-b border-sidebar-border bg-sidebar px-3">
            <span className="text-sm font-semibold text-foreground/70">Settings</span>
          </div>
          <nav aria-hidden="true" className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-0.5">
              {items.map(({ label, Icon, active }) => (
                <li key={label}>
                  <div
                    className={cn(
                      "flex w-full items-center gap-2 border px-2.5 py-2 text-[12px] font-medium",
                      active
                        ? "border-border bg-muted text-foreground/80"
                        : "border-transparent text-muted-foreground/60",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
                    <span className="truncate">{label}</span>
                  </div>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-border bg-background/60 px-6 py-6 md:px-10">
            <div className="mx-auto w-full max-w-3xl">
              <div className="h-7 w-32 bg-foreground/[0.08]" />
              <div className="mt-2 h-3.5 w-72 max-w-full bg-foreground/[0.05]" />
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
            <div className="mx-auto w-full max-w-3xl space-y-5">
              <DataLine className="h-px w-full" />
              <DataLine className="h-px w-10/12" />
              <DataLine className="h-px w-7/12" />
              <DataLine className="h-px w-9/12" />
            </div>
          </div>
        </main>
      </div>
    </LayoutContainer>
  );
}

export function WorkspaceLoadingShell({ variant }: { variant: WorkspaceLoadingVariant }) {
  return (
    <LayoutContainer className="bg-background">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <LoadingRail active={variant} />
        <WorkspaceSidebarSkeleton variant={variant} />
        <WorkspaceContentSkeleton variant={variant} />
      </div>
    </LayoutContainer>
  );
}
