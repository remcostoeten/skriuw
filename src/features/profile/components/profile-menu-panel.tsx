"use client";

import { useProfileSummary } from "../hooks/use-profile-summary";
import { createProfileViewModel } from "../lib/profile-view-model";

export function ProfileMenuPanel() {
  const { auth, noteCount, journalEntryCount, isLoading, error } = useProfileSummary();
  const viewModel = createProfileViewModel(auth, noteCount, journalEntryCount);

  return (
    <div className="w-[260px] px-2 py-1.5">
      <div className="border border-border bg-card px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {auth.user?.name ?? "Account"}
          </p>
          <p className="truncate pt-0.5 text-xs text-muted-foreground">
            {auth.user?.email ?? "Not signed in"}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {viewModel.metrics.map((metric) => (
            <div key={metric.label} className="border border-border bg-background px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {metric.label}
              </div>
              <div className="pt-1 text-sm font-medium text-foreground">
                {isLoading ? "—" : metric.value}
              </div>
            </div>
          ))}
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
