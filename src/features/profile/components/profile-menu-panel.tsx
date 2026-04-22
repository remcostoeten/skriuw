"use client";

import { Cloud, LoaderCircle } from "lucide-react";
import { useProfileSummary } from "../hooks/use-profile-summary";
import { createProfileViewModel } from "../lib/profile-view-model";

export function ProfileMenuPanel() {
  const { auth, noteCount, journalEntryCount, isLoading, error } = useProfileSummary();
  const viewModel = createProfileViewModel(auth, noteCount, journalEntryCount);

  return (
    <div className="w-[260px] px-2 py-1.5">
      <div className="border border-border bg-card px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {auth.user?.name ?? "Account"}
            </p>
            <p className="truncate pt-0.5 text-xs text-muted-foreground">
              {auth.user?.email ?? "Not signed in"}
            </p>
          </div>
          <span className="shrink-0 border border-border bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {viewModel.statusLabel}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 border border-border bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
          <Cloud className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{viewModel.workspaceLabel}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {viewModel.metrics.map((metric) => (
            <div key={metric.label} className="border border-border bg-background px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {metric.label}
              </div>
              <div className="pt-1 text-sm font-medium text-foreground">
                {isLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    Loading
                  </span>
                ) : (
                  metric.value
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 border border-border bg-background px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Workspace ID
          </div>
          <div className="truncate pt-1 text-xs text-foreground/80">
            {auth.workspaceId}
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
