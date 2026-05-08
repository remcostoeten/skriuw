"use client";

import { useState } from "react";
import {
  CheckCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Label } from "@/shared/ui/label";
import { usePreferencesStore, type AiKey } from "@/features/settings/store";
import { AI_MODELS } from "@/features/ai/constants";

type TestStatus =
  | "idle"
  | "loading"
  | "ok"
  | "no_key"
  | "authentication_required"
  | "invalid_key"
  | "invalid_model"
  | "rate_limited"
  | "forbidden"
  | "model_not_found"
  | "provider_error"
  | "error";

const STATUS_COPY: Record<Exclude<TestStatus, "idle" | "loading">, string> = {
  ok: "Connection successful. Gemini accepted this key for the selected model.",
  no_key: "Paste a Gemini API key before testing.",
  authentication_required: "Sign in before testing keys so diagnostics can be linked to your account.",
  invalid_key: "Gemini rejected this key. Check that it was copied correctly.",
  invalid_model: "The selected model is no longer supported. Choose another model.",
  rate_limited: "This key is valid but rate limited or out of quota.",
  forbidden: "This key lacks permission for the selected model.",
  model_not_found: "Model not found. Try selecting a different model.",
  provider_error: "Gemini returned an unexpected validation error.",
  error: "Could not reach the validation endpoint. Try again.",
};

type TestResult = {
  status: TestStatus;
  details?: string;
  eventId?: string;
};

async function testKey(apiKey: string, model: string): Promise<TestResult> {
  try {
    const res = await fetch("/api/ai/test-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, model }),
    });
    if (res.ok) return { status: "ok" };
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      details?: string;
      eventId?: string;
    };
    return {
      status: (data.code as TestStatus) ?? "error",
      details: data.details,
      eventId: data.eventId,
    };
  } catch {
    return { status: "error" };
  }
}

function KeyRow({
  k,
  isActive,
  onSetActive,
  onRemove,
  onTest,
}: {
  k: AiKey;
  isActive: boolean;
  onSetActive: () => void;
  onRemove: () => void;
  onTest: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border px-3 py-2.5 transition-colors",
        isActive ? "border-ring/60 bg-accent/40" : "border-border bg-background",
      )}
    >
      <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground">{k.name}</span>
          {isActive && (
            <span className="shrink-0 border border-ring/40 bg-ring/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-ring">
              active
            </span>
          )}
          {k.tested && !isActive && (
            <CheckCircle className="h-3 w-3 shrink-0 text-green-500/70" strokeWidth={1.5} />
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          {k.apiKey.slice(0, 8)}•••
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isActive && (
          <button
            type="button"
            onClick={onSetActive}
            title="Set as active key"
            className="flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <Star className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          onClick={onTest}
          className="h-6 border border-border bg-transparent px-2 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Test
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function AiSettings() {
  const { ai, updateAiPreference, addAiKey, removeAiKey, setActiveAiKey, markAiKeyTested } =
    usePreferencesStore();

  const [draftName, setDraftName] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [showDraftKey, setShowDraftKey] = useState(false);
  const [draftTestStatus, setDraftTestStatus] = useState<TestStatus>("idle");
  const [draftTestDetails, setDraftTestDetails] = useState<TestResult | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [rowTestStatus, setRowTestStatus] = useState<Record<string, TestResult>>({});

  const handleTestDraft = async () => {
    if (!draftKey.trim()) return;
    setDraftTestStatus("loading");
    setDraftTestDetails(null);
    const result = await testKey(draftKey.trim(), ai.model);
    setDraftTestStatus(result.status);
    setDraftTestDetails(result);
  };

  const handleAddKey = () => {
    if (!draftKey.trim() || !draftName.trim() || draftTestStatus !== "ok") return;
    const newKey: AiKey = {
      id: crypto.randomUUID(),
      name: draftName.trim(),
      apiKey: draftKey.trim(),
      tested: true,
    };
    addAiKey(newKey);
    setDraftName("");
    setDraftKey("");
    setDraftTestStatus("idle");
    setShowAddForm(false);
  };

  const handleTestRow = async (k: AiKey) => {
    setRowTestStatus((s) => ({ ...s, [k.id]: { status: "loading" } }));
    const result = await testKey(k.apiKey, ai.model);
    setRowTestStatus((s) => ({ ...s, [k.id]: result }));
    if (result.status === "ok") markAiKeyTested(k.id);
  };

  const canAdd = draftTestStatus === "ok" && draftKey.trim() && draftName.trim();

  return (
    <div className="space-y-7">
      {/* Model */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Preferred model</Label>
          <p className="text-xs text-muted-foreground">
            Applied to all AI actions — spell check, continue writing, title generation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {AI_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateAiPreference("model", m.id)}
              className={cn(
                "relative flex min-w-[100px] flex-col items-start border px-3 py-2.5 text-left transition-colors",
                ai.model === m.id
                  ? "border-ring bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="text-xs font-medium leading-tight">{m.label}</span>
              <span className="mt-0.5 text-[10px] opacity-60">{m.desc}</span>
              {"recommended" in m && m.recommended && (
                <span className="absolute -top-2 right-1.5 bg-ring px-1 text-[9px] font-semibold uppercase leading-5 tracking-wide text-background">
                  rec
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Key list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-medium">API keys</Label>
            <p className="text-xs text-muted-foreground">
              Keys are stored locally. When the active key hits a rate limit, you can switch inline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex h-7 items-center gap-1 border border-border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" strokeWidth={2} />
            Add key
          </button>
        </div>

        {ai.keys.length === 0 && !showAddForm && (
          <p className="text-xs text-muted-foreground/60 italic">
            No keys saved yet. Add one to enable AI features.
          </p>
        )}

        <div className="space-y-1.5">
          {ai.keys.map((k) => (
            <div key={k.id} className="space-y-1">
              <KeyRow
                k={k}
                isActive={ai.activeKeyId === k.id}
                onSetActive={() => setActiveAiKey(k.id)}
                onRemove={() => removeAiKey(k.id)}
                onTest={() => handleTestRow(k)}
              />
              {rowTestStatus[k.id] && rowTestStatus[k.id].status !== "idle" && (
                <div
                  className={cn(
                    "space-y-1 px-3 py-1.5 text-[10px]",
                    rowTestStatus[k.id].status === "loading" && "text-muted-foreground",
                    rowTestStatus[k.id].status === "ok" && "text-green-400",
                    rowTestStatus[k.id].status !== "loading" &&
                      rowTestStatus[k.id].status !== "ok" &&
                      "text-destructive",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {rowTestStatus[k.id].status === "loading" ? (
                      <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                    ) : rowTestStatus[k.id].status === "ok" ? (
                      <CheckCircle className="h-3 w-3" strokeWidth={1.5} />
                    ) : (
                      <XCircle className="h-3 w-3" strokeWidth={1.5} />
                    )}
                    {rowTestStatus[k.id].status !== "loading" &&
                      STATUS_COPY[rowTestStatus[k.id].status as Exclude<TestStatus, "idle" | "loading">]}
                    {rowTestStatus[k.id].status === "loading" && "Testing…"}
                  </div>
                  {rowTestStatus[k.id].details && (
                    <p className="pl-4 opacity-70">{rowTestStatus[k.id].details}</p>
                  )}
                  {rowTestStatus[k.id].eventId && (
                    <p className="pl-4 font-mono opacity-50">Diagnostic event: {rowTestStatus[k.id].eventId}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add key form */}
        {showAddForm && (
          <div className="space-y-3 border border-border bg-background/50 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Key name (e.g. Personal)"
                className="h-9 flex-1 border border-border bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-ring transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
	                  type={showDraftKey ? "text" : "password"}
	                  value={draftKey}
	                  onChange={(e) => {
	                    setDraftKey(e.target.value);
	                    setDraftTestStatus("idle");
	                    setDraftTestDetails(null);
	                  }}
                  placeholder="AIzaSy..."
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 w-full border border-border bg-background px-3 pr-9 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-ring transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDraftKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showDraftKey ? (
                    <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={handleTestDraft}
                disabled={!draftKey.trim() || draftTestStatus === "loading"}
                className="inline-flex h-9 items-center gap-1.5 border border-border bg-background px-3 text-xs text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                {draftTestStatus === "loading" && (
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                )}
                Test
              </button>
            </div>

            {draftTestStatus !== "idle" && draftTestStatus !== "loading" && (
              <div
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  draftTestStatus === "ok" ? "text-green-400" : "text-destructive",
                )}
              >
                {draftTestStatus === "ok" ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                )}
                <span>{STATUS_COPY[draftTestStatus]}</span>
              </div>
            )}
            {draftTestStatus !== "idle" && draftTestStatus !== "loading" && draftTestDetails?.details && (
              <p className="text-xs text-muted-foreground">{draftTestDetails.details}</p>
            )}
            {draftTestDetails?.eventId && (
              <p className="font-mono text-[10px] text-muted-foreground/60">
                Diagnostic event: {draftTestDetails.eventId}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddKey}
                disabled={!canAdd}
                className="inline-flex h-9 items-center gap-1.5 border border-ring/60 bg-ring/10 px-3 text-xs text-ring transition-colors hover:bg-ring/20 disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="h-3 w-3" strokeWidth={2} />
                Save key
              </button>
              <button
                type="button"
	                onClick={() => {
	                  setShowAddForm(false);
	                  setDraftName("");
	                  setDraftKey("");
	                  setDraftTestStatus("idle");
	                  setDraftTestDetails(null);
	                }}
                className="h-9 border border-border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
