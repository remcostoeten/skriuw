"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, Cloud, LoaderCircle, LogOut, NotebookPen } from "lucide-react";
import { Button } from "@/shared/ui/button-component";
import { Separator } from "@/shared/ui/separator";
import { signOut } from "@/platform/auth";
import { useProfileSummary } from "../hooks/use-profile-summary";
import { createProfileViewModel } from "../lib/profile-view-model";

type PendingAction = "sign-out" | null;

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ProfileMetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ProfilePage() {
  const { auth, noteCount, journalEntryCount, isLoading, error } = useProfileSummary();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const viewModel = createProfileViewModel(auth, noteCount, journalEntryCount);

  const runAction = async (action: PendingAction, fn: () => Promise<void>) => {
    try {
      setPendingAction(action);
      setActionError(null);
      await fn();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Cloud className="h-3.5 w-3.5" />
          {viewModel.workspaceLabel}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{viewModel.title}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {viewModel.subtitle}
            </p>
          </div>
          <span className="border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {viewModel.statusLabel}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
        <section className="space-y-6">
          <div className="border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-medium text-foreground">Identity</h2>
                <p className="text-sm text-muted-foreground">
                  The current session, identity, and workspace identifiers.
                </p>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="grid gap-4 sm:grid-cols-2">
              {viewModel.identityRows.map((row) => (
                <ProfileField key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>

          <div className="border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-medium text-foreground">Metrics</h2>
                <p className="text-sm text-muted-foreground">
                  Lightweight workspace counts pulled from the current storage backend.
                </p>
              </div>
            </div>

            <Separator className="my-5" />

            <div className="grid gap-4 sm:grid-cols-2">
              {viewModel.metrics.map((metric) => (
                <ProfileMetricCard
                  key={metric.label}
                  label={metric.label}
                  value={isLoading ? "Loading…" : metric.value}
                  hint={metric.hint}
                />
              ))}
            </div>

            {error ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {actionError ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {actionError}
              </p>
            ) : null}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="border border-border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-medium text-foreground">Account controls</h2>
              <p className="text-sm text-muted-foreground">
                Only controls that are already backed by the current app are shown here.
              </p>
            </div>

            <Separator className="my-5" />

            {auth.user ? (
              <div className="space-y-3">
                <Button
                  type="button"
                  className="h-11 w-full justify-start"
                  disabled={pendingAction !== null}
                  onClick={() =>
                    void runAction("sign-out", async () => {
                      await signOut();
                    })
                  }
                >
                  {pendingAction === "sign-out" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-sm font-medium text-foreground">You are not signed in.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sign in to store notes and journal entries in your own cloud workspace.
                  </p>
                </div>
                <Button asChild className="w-full">
                  <Link href="/sign-up">Sign up</Link>
                </Button>
              </div>
            )}
          </div>

          <div className="border border-border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-medium text-foreground">Quick links</h2>
              <p className="text-sm text-muted-foreground">Jump back into the main workspace.</p>
            </div>

            <Separator className="my-5" />

            <div className="space-y-3">
              <Button asChild variant="outline" className="h-11 w-full justify-start border-border bg-transparent">
                <Link href="/app">
                  <NotebookPen className="h-4 w-4" />
                  Open notes
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full justify-start border-border bg-transparent">
                <Link href="/app/journal">
                  <BookOpen className="h-4 w-4" />
                  Open journal
                </Link>
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
