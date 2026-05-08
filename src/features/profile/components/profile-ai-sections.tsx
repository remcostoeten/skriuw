"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  CircleAlert,
  Clock,
  KeyRound,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { DEFAULT_AI_MODEL } from "@/features/ai/constants";
import type { AiProviderKeySummary, AiUsageLogRow } from "@/features/ai/types";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";

type LoadState = "idle" | "loading" | "error";

function StatusBadge({ status }: { status: string }) {
  const ok = status === "success" || status === "valid";
  const warning = status === "rate_limited" || status === "untested";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        ok && "border-green-500/25 bg-green-500/10 text-green-500",
        warning && "border-amber-500/25 bg-amber-500/10 text-amber-500",
        !ok && !warning && "border-destructive/25 bg-destructive/10 text-destructive",
      )}
    >
      {ok ? <CheckCircle className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
      {status.replace("_", " ")}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTokenCount(value: number | null) {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

export function ProfileAiSections({ isSignedIn }: { isSignedIn: boolean }) {
  const [keys, setKeys] = useState<AiProviderKeySummary[]>([]);
  const [keyState, setKeyState] = useState<LoadState>("idle");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsageLogRow[]>([]);
  const [usageState, setUsageState] = useState<LoadState>("idle");
  const [usageError, setUsageError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const providerLabel = "Gemini";

  async function loadKeys() {
    if (!isSignedIn) return;
    setKeyState("loading");
    setKeyError(null);
    try {
      const res = await fetch("/api/profile/ai/keys");
      if (!res.ok) throw new Error("Could not load AI keys.");
      const data = (await res.json()) as { keys: AiProviderKeySummary[] };
      setKeys(data.keys);
      setKeyState("idle");
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Could not load AI keys.");
      setKeyState("error");
    }
  }

  async function loadUsage(offset = 0) {
    if (!isSignedIn) return;
    setUsageState("loading");
    setUsageError(null);
    try {
      const res = await fetch(`/api/profile/ai/usage?limit=20&offset=${offset}`);
      if (!res.ok) throw new Error("Could not load AI usage.");
      const data = (await res.json()) as { usage: AiUsageLogRow[]; nextOffset: number | null };
      setUsage((current) => (offset === 0 ? data.usage : [...current, ...data.usage]));
      setNextOffset(data.nextOffset);
      setUsageState("idle");
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : "Could not load AI usage.");
      setUsageState("error");
    }
  }

  useEffect(() => {
    void loadKeys();
    void loadUsage(0);
  }, [isSignedIn]);

  async function saveKey() {
    if (!label.trim() || !apiKey.trim()) return;
    setSaving(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/profile/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gemini", label, apiKey }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        key?: AiProviderKeySummary;
        error?: string;
      };
      if (!res.ok || !data.key) throw new Error(data.error ?? "Could not save AI key.");
      setKeys((current) => [data.key!, ...current.filter((key) => key.id !== data.key!.id)]);
      setLabel("");
      setApiKey("");
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Could not save AI key.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteKey(keyId: string) {
    setKeyError(null);
    try {
      const res = await fetch(`/api/profile/ai/keys/${keyId}`, { method: "DELETE" });
      if (!res.ok) {
        setKeyError("Could not remove AI key.");
        return;
      }
      setKeys((current) => current.filter((key) => key.id !== keyId));
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Could not remove AI key.");
    }
  }

  async function renameKey(key: AiProviderKeySummary) {
    const nextLabel = window.prompt("Key label", key.label)?.trim();
    if (!nextLabel || nextLabel === key.label) return;
    const res = await fetch(`/api/profile/ai/keys/${key.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: nextLabel }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      key?: AiProviderKeySummary;
      error?: string;
    };
    if (!res.ok || !data.key) {
      setKeyError(data.error ?? "Could not update AI key.");
      return;
    }
    setKeys((current) => current.map((item) => (item.id === key.id ? data.key! : item)));
  }

  async function testKey(keyId: string) {
    setTestingId(keyId);
    setKeyError(null);
    try {
      const res = await fetch(`/api/profile/ai/keys/${keyId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: DEFAULT_AI_MODEL }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Key test failed.");
      }
      await loadKeys();
      await loadUsage(0);
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Key test failed.");
      await loadKeys();
    } finally {
      setTestingId(null);
    }
  }

  if (!isSignedIn) {
    return (
      <section className="border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-medium text-foreground">AI</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to manage AI provider keys and view usage.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[0.9fr_1.35fr]">
      <div className="border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-medium text-foreground">AI Keys</h2>
            <p className="text-sm text-muted-foreground">
              User-owned provider keys stay encrypted server-side. Raw values are never shown after save.
            </p>
          </div>
          <KeyRound className="h-5 w-5 text-muted-foreground" />
        </div>

        <Separator className="my-5" />

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[0.85fr_1.15fr]">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Personal Gemini"
              className="h-10 border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring"
            />
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Gemini API key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="h-10 border border-border bg-background px-3 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring"
            />
          </div>
          <Button
            type="button"
            onClick={() => void saveKey()}
            disabled={!label.trim() || !apiKey.trim() || saving}
            className="h-10"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save key
          </Button>
        </div>

        {keyError ? <p className="mt-4 text-sm text-destructive">{keyError}</p> : null}

        <div className="mt-5 space-y-2">
          {keyState === "loading" && keys.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading keys
            </div>
          ) : null}

          {keys.length === 0 && keyState !== "loading" ? (
            <div className="border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
              No AI provider keys saved yet.
            </div>
          ) : null}

          {keys.map((key) => (
            <div key={key.id} className="border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{key.label}</p>
                    <StatusBadge status={key.status} />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {providerLabel} · {key.keyPreview}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground/70">
                    <Clock className="h-3 w-3" />
                    Tested {formatDate(key.lastTestedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 border-border bg-transparent px-2 text-xs"
                    onClick={() => void renameKey(key)}
                  >
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 border-border bg-transparent px-2 text-xs"
                    onClick={() => void testKey(key.id)}
                    disabled={testingId === key.id}
                  >
                    {testingId === key.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
                    Test
                  </Button>
                  <button
                    type="button"
                    onClick={() => void deleteKey(key.id)}
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Remove AI key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-medium text-foreground">AI Usage</h2>
            <p className="text-sm text-muted-foreground">
              Signed-in model calls, provider errors, token counts, and linked resources.
            </p>
          </div>
          {usageState === "loading" ? <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
        </div>

        <Separator className="my-5" />

        {usageError ? <p className="mb-4 text-sm text-destructive">{usageError}</p> : null}

        {usage.length === 0 && usageState !== "loading" ? (
          <div className="border border-dashed border-border bg-background/60 p-5 text-sm text-muted-foreground">
            No AI usage has been logged for this account yet.
          </div>
        ) : null}

        <div className="space-y-3">
          {usage.map((row) => (
            <article key={row.id} className="border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {row.humanAction ?? row.action}
                    </h3>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.provider} · {row.model ?? "Unknown model"} · {formatDate(row.createdAt)}
                  </p>
                </div>
                <span className="border border-border bg-card px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {row.keySource.replace("_", " ")}
                </span>
              </div>

              {row.resourceUrl ? (
                <a
                  href={row.resourceUrl}
                  className="mt-2 inline-flex text-xs text-ring underline-offset-4 hover:underline"
                >
                  {row.resourceUrl}
                </a>
              ) : null}

              {row.errorMessage ? (
                <p className="mt-2 text-xs text-destructive">{row.errorMessage}</p>
              ) : null}

              {row.prompt ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/80">{row.prompt}</p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="border border-border bg-card px-2 py-1.5">
                  <span className="text-muted-foreground">In</span>
                  <p className="font-medium">{formatTokenCount(row.inputTokens)}</p>
                </div>
                <div className="border border-border bg-card px-2 py-1.5">
                  <span className="text-muted-foreground">Out</span>
                  <p className="font-medium">{formatTokenCount(row.outputTokens)}</p>
                </div>
                <div className="border border-border bg-card px-2 py-1.5">
                  <span className="text-muted-foreground">Total</span>
                  <p className="font-medium">{formatTokenCount(row.totalTokens)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {nextOffset !== null ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4 h-10 border-border bg-transparent"
            disabled={usageState === "loading"}
            onClick={() => void loadUsage(nextOffset)}
          >
            {usageState === "loading" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Load more
          </Button>
        ) : null}
      </div>
    </section>
  );
}
