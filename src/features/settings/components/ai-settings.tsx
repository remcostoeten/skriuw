"use client";

import { useState } from "react";
import { CheckCircle, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Label } from "@/shared/ui/label";
import { usePreferencesStore } from "@/features/settings/store";

const MODELS = [
  {
    id: "gemini-2.5-flash-lite",
    label: "Flash Lite",
    desc: "Fastest · cheapest",
  },
  {
    id: "gemini-2.5-flash",
    label: "Flash",
    desc: "Best balance",
    recommended: true,
  },
  {
    id: "gemini-2.5-pro",
    label: "Pro",
    desc: "Most capable",
  },
] as const;

type TestStatus = "idle" | "loading" | "ok" | "invalid_key" | "rate_limited" | "forbidden" | "model_not_found" | "error";

const STATUS_MESSAGES: Record<Exclude<TestStatus, "idle" | "loading">, string> = {
  ok: "Connection successful — key is valid.",
  invalid_key: "API key is invalid or not authorized.",
  rate_limited: "Key is rate limited or quota exceeded. Try again later.",
  forbidden: "Key lacks permission for this model. Check API key restrictions.",
  model_not_found: "Model not found. Try selecting a different model.",
  error: "Could not reach Gemini API. Check your key and try again.",
};

export function AiSettings() {
  const { ai, updateAiPreference } = usePreferencesStore();
  const [keyDraft, setKeyDraft] = useState(ai.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");

  const keySaved = keyDraft.trim() === (ai.apiKey ?? "");

  const handleSaveKey = () => {
    updateAiPreference("apiKey", keyDraft.trim() || null);
  };

  const handleTestKey = async () => {
    const key = keyDraft.trim() || ai.apiKey;
    if (!key) return;
    setTestStatus("loading");
    try {
      const res = await fetch("/api/ai/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, model: ai.model }),
      });
      if (res.ok) {
        setTestStatus("ok");
      } else {
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        setTestStatus((data.code as TestStatus) ?? "error");
      }
    } catch {
      setTestStatus("error");
    }
  };

  const hasKey = keyDraft.trim() || ai.apiKey;

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Preferred model</Label>
          <p className="text-xs text-muted-foreground">
            Applied to all AI actions — spell check, continue writing, and title generation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                updateAiPreference("model", m.id);
                setTestStatus("idle");
              }}
              className={cn(
                "relative flex flex-col items-start px-3 py-2.5 border text-left transition-colors min-w-[100px]",
                ai.model === m.id
                  ? "border-ring bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="text-xs font-medium leading-tight">{m.label}</span>
              <span className="text-[10px] opacity-60 mt-0.5">{m.desc}</span>
              {"recommended" in m && m.recommended && (
                <span className="absolute -top-2 right-1.5 text-[9px] px-1 bg-ring text-background font-semibold uppercase tracking-wide leading-5">
                  rec
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">API key</Label>
          <p className="text-xs text-muted-foreground">
            Your own Gemini key. Stored locally in your browser, sent only when making AI
            requests. Leave empty to use the server-side key (if configured).
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={keyDraft}
              onChange={(e) => {
                setKeyDraft(e.target.value);
                setTestStatus("idle");
              }}
              placeholder="AIzaSy..."
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full border border-border bg-background px-3 pr-9 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-ring transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKey ? (
                <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
              ) : (
                <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleSaveKey}
            disabled={keySaved}
            className="h-9 px-3 border border-border bg-background text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Save
          </button>
        </div>
        {ai.apiKey && keySaved && (
          <p className="text-[11px] text-muted-foreground">
            Key saved · {ai.apiKey.slice(0, 8)}•••
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Test connection</Label>
          <p className="text-xs text-muted-foreground">
            Send a minimal ping with the current key and model to verify everything works.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTestKey}
          disabled={testStatus === "loading" || !hasKey}
          className="inline-flex h-9 items-center gap-2 border border-border bg-background px-3 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {testStatus === "loading" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          )}
          Test key
        </button>

        {testStatus !== "idle" && testStatus !== "loading" && (
          <div
            className={cn(
              "flex items-start gap-2 border p-3 text-xs",
              testStatus === "ok"
                ? "border-green-500/30 bg-green-500/[0.06] text-green-400"
                : "border-destructive/30 bg-destructive/[0.06] text-destructive",
            )}
          >
            {testStatus === "ok" ? (
              <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            )}
            <span>{STATUS_MESSAGES[testStatus]}</span>
          </div>
        )}
      </div>
    </div>
  );
}
