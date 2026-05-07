import { BookOpen, FolderOpen, Search, SlidersHorizontal } from "lucide-react";
import { LayoutContainer } from "./layout-container";
import { cn } from "@/shared/lib/utils";

type WorkspaceLoadingVariant = "notes" | "journal";

function LoadingLine({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-full bg-sidebar-foreground/10", className)}
    />
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
            <div className="h-5 w-5 rounded-sm bg-sidebar-foreground/18" />
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
        <div className="mb-4 h-9 w-9 rounded-full border border-sidebar-border bg-sidebar-foreground/8" />
      </aside>
      <div aria-hidden="true" className="hidden w-14 shrink-0 md:block" />
    </>
  );
}

export function WorkspaceSidebarSkeleton({ variant }: { variant: WorkspaceLoadingVariant }) {
  const rows = variant === "journal" ? 8 : 10;

  return (
    <div className="hidden w-[18rem] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
      <div className="flex h-11 items-center justify-between border-b border-sidebar-border px-3">
        <LoadingLine className="h-3 w-20" />
        <div className="flex items-center gap-2 text-sidebar-foreground/38">
          <Search className="h-4 w-4" strokeWidth={1.5} />
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
        </div>
      </div>
      <div className="space-y-5 p-3">
        <div className="space-y-2">
          <LoadingLine className="h-2.5 w-14" />
          <div className="space-y-1.5">
            {Array.from({ length: rows }).map((_, index) => (
              <div
                key={index}
                className="flex h-8 items-center gap-2 rounded-md px-2"
              >
                <div className="h-4 w-4 rounded bg-sidebar-foreground/10" />
                <LoadingLine
                  className={cn(
                    "h-2.5",
                    index % 3 === 0 ? "w-32" : index % 3 === 1 ? "w-40" : "w-24",
                  )}
                />
              </div>
            ))}
          </div>
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
            <div className="h-7 w-7 rounded border border-sidebar-border/70 bg-sidebar-foreground/5" />
            <div className="h-7 w-7 rounded border border-sidebar-border/70 bg-sidebar-foreground/5" />
            <div className="h-7 w-7 rounded border border-sidebar-border/70 bg-sidebar-foreground/5" />
          </div>
          <div className="flex flex-1 justify-center">
            <LoadingLine className="h-3 w-56" />
          </div>
          <div className="h-7 w-24 rounded border border-sidebar-border/70 bg-sidebar-foreground/5" />
        </div>
        <div className="flex flex-1 flex-col px-[max(2rem,8vw)] py-10">
          <LoadingLine className="h-5 w-48 bg-foreground/10" />
          <div className="mt-10 space-y-4">
            <LoadingLine className="h-3 w-full max-w-3xl bg-foreground/8" />
            <LoadingLine className="h-3 w-full max-w-4xl bg-foreground/8" />
            <LoadingLine className="h-3 w-2/3 max-w-2xl bg-foreground/8" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
      <div className="flex h-11 items-center justify-between border-b border-sidebar-border bg-sidebar px-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded border border-sidebar-border/70 bg-sidebar-foreground/5" />
          <div className="h-7 w-7 rounded border border-sidebar-border/70 bg-sidebar-foreground/5" />
        </div>
        <LoadingLine className="h-3 w-44" />
        <div className="h-7 w-20 rounded border border-sidebar-border/70 bg-sidebar-foreground/5" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col px-[max(2rem,8vw)] py-10">
          <LoadingLine className="h-6 w-64 bg-foreground/10" />
          <div className="mt-10 space-y-4">
            <LoadingLine className="h-3 w-full max-w-4xl bg-foreground/8" />
            <LoadingLine className="h-3 w-full max-w-3xl bg-foreground/8" />
            <LoadingLine className="h-3 w-3/4 max-w-2xl bg-foreground/8" />
          </div>
        </div>
        <div className="hidden w-72 shrink-0 border-l border-sidebar-border bg-sidebar/80 p-4 lg:block">
          <LoadingLine className="h-3 w-20" />
          <div className="mt-5 space-y-3">
            <LoadingLine className="h-2.5 w-full" />
            <LoadingLine className="h-2.5 w-5/6" />
            <LoadingLine className="h-2.5 w-3/5" />
          </div>
        </div>
      </div>
    </div>
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
