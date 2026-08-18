import { useEffect, useMemo, useState } from "react";
import type {
  AiHistorySettings,
  AiHistoryView,
  AiRunFilter,
  AiRunRecord,
  AiRunState,
} from "@/contracts/ai";
import { appRouteHash } from "@/app-route";
import {
  clearAiRunHistory,
  loadAiHistory,
  saveAiHistorySettings,
} from "@/features/ai/history-bridge";
import { stagePlaygroundPrefill } from "@/features/ai/playground-prefill";
import {
  USAGE_PERIODS,
  decodeModelFilter,
  formatCostMicros,
  formatDuration,
  formatRunTimestamp,
  formatTokens,
  runFilterOptions,
  runStateLabel,
  runTokenSummary,
  tokenSourceNote,
  usageByModel,
  usagePeriodStart,
  usageTotals,
  type UsagePeriod,
} from "@/features/ai/usage-model";
import { cn } from "@/shared/lib/utils";
import {
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
} from "./settings-shared";

type Props = {
  signal: AbortSignal;
};

const RUN_STATES: readonly AiRunState[] = ["done", "cancelled", "timed_out", "failed"];
const ALL = "all";

const selectClass =
  "min-h-[28px] rounded-lg border border-border bg-muted px-2 py-[3px] text-xs text-foreground outline-none focus-visible:border-foreground/70";
const statTileClass = "rounded-lg border border-border/60 bg-card/30 px-3 py-2";
const statValueClass = "mt-0.5 block text-[15px] font-[620] tabular-nums text-foreground";
const statLabelClass = "text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground";

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

export function AiUsagePanel({ signal }: Props) {
  const [period, setPeriod] = useState<UsagePeriod>("30d");
  const [providerFilter, setProviderFilter] = useState(ALL);
  const [modelFilter, setModelFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState<AiRunState | typeof ALL>(ALL);
  const [view, setView] = useState<AiHistoryView | null>(null);
  const [openRun, setOpenRun] = useState<AiRunRecord | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const filter = useMemo<AiRunFilter>(() => {
    const model = modelFilter === ALL ? null : decodeModelFilter(modelFilter);
    return {
      providerId: model?.providerId ?? (providerFilter === ALL ? null : providerFilter),
      modelId: model?.modelId ?? null,
      state: stateFilter === ALL ? null : stateFilter,
      limit: 50,
    };
  }, [modelFilter, providerFilter, stateFilter]);

  useEffect(() => {
    let active = true;
    const sinceMs = usagePeriodStart(period, Date.now());
    void loadAiHistory(filter, sinceMs)
      .then((next) => {
        if (!active || signal.aborted) return;
        setView(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active || signal.aborted) return;
        setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [filter, period, reloads, signal]);

  const aggregates = view?.aggregates ?? [];
  const totals = useMemo(() => usageTotals(aggregates), [aggregates]);
  const models = useMemo(() => usageByModel(aggregates), [aggregates]);
  const options = useMemo(() => runFilterOptions(aggregates), [aggregates]);
  const totalsNote = tokenSourceNote(totals.estimated);
  const settings = view?.settings ?? null;

  async function applySettings(next: AiHistorySettings): Promise<void> {
    setBusy(true);
    try {
      await saveAiHistorySettings(next);
      if (!signal.aborted) {
        setError(null);
        setReloads((count) => count + 1);
      }
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory(): Promise<void> {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setBusy(true);
    try {
      await clearAiRunHistory();
      if (!signal.aborted) {
        setClearArmed(false);
        setOpenRun(null);
        setError(null);
        setReloads((count) => count + 1);
      }
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function rerunInPlayground(run: AiRunRecord): void {
    if (!run.prompts) return;
    stagePlaygroundPrefill({
      selection: { providerId: run.providerId, modelId: run.modelId },
      systemPrompt: run.prompts.systemPrompt,
      userPrompt: run.prompts.userPrompt,
    });
    window.location.hash = appRouteHash("prompt-playground");
  }

  return (
    <section aria-label="AI usage" className={settingsGroup}>
      <h2 className={settingsGroupTitle}>Usage</h2>
      <p className={settingsGroupHint}>
        Every AI run this device made, recorded locally. Nothing here syncs, exports, or leaves
        the machine.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Period
          <select
            aria-label="Usage period"
            className={selectClass}
            value={period}
            onChange={(event) => setPeriod(event.target.value as UsagePeriod)}
          >
            {USAGE_PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-2 grid grid-cols-4 gap-2 max-[560px]:grid-cols-2">
        <div className={statTileClass}>
          <span className={statLabelClass}>Runs</span>
          <span className={statValueClass}>{formatTokens(totals.runs)}</span>
        </div>
        <div className={statTileClass}>
          <span className={statLabelClass}>Input tokens</span>
          <span className={statValueClass}>{formatTokens(totals.inputTokens)}</span>
        </div>
        <div className={statTileClass}>
          <span className={statLabelClass}>Output tokens</span>
          <span className={statValueClass}>{formatTokens(totals.outputTokens)}</span>
        </div>
        <div className={statTileClass}>
          <span className={statLabelClass}>Remote cost</span>
          <span className={statValueClass}>{formatCostMicros(totals.costMicros)}</span>
        </div>
      </div>
      {totalsNote ? (
        <p className="mb-2 text-[11px] text-muted-foreground">{totalsNote}</p>
      ) : null}
      {view?.pricingAsOf ? (
        <p className="mb-3 text-[11px] text-muted-foreground">
          Cost is calculated from the catalogue priced {view.pricingAsOf}, not from a provider
          invoice.
        </p>
      ) : null}

      {models.length > 0 ? (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Model</th>
                <th className="py-1 pr-2 text-right font-medium">Runs</th>
                <th className="py-1 pr-2 text-right font-medium">Tokens</th>
                <th className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {models.map((row) => (
                <tr key={row.key} className="border-t border-[hsl(var(--border)/0.5)]">
                  <td className="py-1.5 pr-2">
                    {row.providerId} · {row.modelId}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{row.runs}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {row.estimated ? "~" : ""}
                    {formatTokens(row.inputTokens + row.outputTokens)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {row.estimated ? "~" : ""}
                    {formatCostMicros(row.costMicros)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Provider
          <select
            aria-label="Filter by provider"
            className={selectClass}
            value={providerFilter}
            onChange={(event) => {
              setProviderFilter(event.target.value);
              setModelFilter(ALL);
            }}
          >
            <option value={ALL}>All providers</option>
            {options.providers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Model
          <select
            aria-label="Filter by model"
            className={selectClass}
            value={modelFilter}
            onChange={(event) => setModelFilter(event.target.value)}
          >
            <option value={ALL}>All models</option>
            {options.models.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          State
          <select
            aria-label="Filter by state"
            className={selectClass}
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as AiRunState | typeof ALL)}
          >
            <option value={ALL}>All states</option>
            {RUN_STATES.map((state) => (
              <option key={state} value={state}>
                {runStateLabel(state)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {view === null ? (
        <p className="text-[12px] text-muted-foreground">Loading usage…</p>
      ) : view.runs.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No runs recorded for this period and filter.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {view.runs.map((run) => (
            <li key={run.runId} className={cn(settingsRow, "items-start")}>
              <span className={settingsRowLabel}>
                <span className="text-[12.5px]">
                  {run.providerId} · {run.modelId}
                </span>
                <span className={settingsRowDescription}>
                  {formatRunTimestamp(run.startedAtMs)} · {runStateLabel(run.state)} ·{" "}
                  {formatDuration(run.durationMs)} · {runTokenSummary(run)}
                  {run.costMicros ? ` · ${formatCostMicros(run.costMicros)}` : ""}
                  {run.prompts ? "" : " · prompt not retained"}
                </span>
              </span>
              <button
                type="button"
                className={settingsButton}
                aria-expanded={openRun?.runId === run.runId}
                onClick={() =>
                  setOpenRun((current) => (current?.runId === run.runId ? null : run))
                }
              >
                {openRun?.runId === run.runId ? "Close" : "Open"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {openRun ? (
        <div className="mt-3 rounded-lg border border-border/60 bg-card/30 p-3">
          <h3 className="m-0 text-[12.5px] font-[620]">Run {openRun.runId}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatRunTimestamp(openRun.startedAtMs)} · origin {openRun.origin} ·{" "}
            {runStateLabel(openRun.state)}
            {openRun.errorCategory ? ` (${openRun.errorCategory})` : ""} ·{" "}
            {formatDuration(openRun.durationMs)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {runTokenSummary(openRun)} tokens ·{" "}
            {openRun.costMicros === null || openRun.costMicros === undefined
              ? "no catalogue price for this model"
              : formatCostMicros(openRun.costMicros)}
          </p>
          {openRun.tokens.source === "estimated" ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tokenSourceNote(true)}
            </p>
          ) : null}
          {openRun.prompts ? (
            <>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-[11.5px]">
                {openRun.prompts.systemPrompt || "(no system prompt)"}
              </pre>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-[11.5px]">
                {openRun.prompts.userPrompt}
              </pre>
              <button
                type="button"
                className={cn(settingsButton, "mt-2")}
                onClick={() => rerunInPlayground(openRun)}
              >
                Rerun in playground
              </button>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Prompt text was not retained for this run.
            </p>
          )}
        </div>
      ) : null}

      {settings ? (
        <>
          <label className={cn(settingsRow, "mt-3 cursor-pointer")}>
            <span className={settingsRowLabel}>
              Keep prompt text
              <span className={settingsRowDescription}>
                Off records only metadata — provider, model, state, timing, tokens, and cost.
              </span>
            </span>
            <input
              type="checkbox"
              data-directional-focus
              className="h-[17px] w-[30px] flex-none cursor-pointer appearance-none rounded-full border border-border bg-muted transition-colors checked:border-foreground/45 checked:bg-accent after:m-0.5 after:block after:h-[11px] after:w-[11px] after:rounded-full after:bg-muted-foreground after:transition-transform after:content-[''] checked:after:translate-x-[13px] checked:after:bg-foreground outline-none focus-visible:border-foreground/70"
              checked={settings.retainPrompts}
              disabled={busy}
              onChange={(event) =>
                void applySettings({
                  ...settings,
                  retainPrompts: event.currentTarget.checked,
                })
              }
            />
          </label>
          <div className={settingsRow}>
            <span className={settingsRowLabel}>
              Retention
              <span className={settingsRowDescription}>
                Older runs and runs beyond the cap are pruned as new runs are recorded.
              </span>
            </span>
            <span className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Runs
                <input
                  aria-label="Maximum stored runs"
                  className={selectClass}
                  inputMode="numeric"
                  size={5}
                  defaultValue={settings.retention.maxRuns}
                  disabled={busy}
                  onBlur={(event) => {
                    const maxRuns = Number(event.currentTarget.value.trim());
                    if (!Number.isFinite(maxRuns) || maxRuns === settings.retention.maxRuns) {
                      return;
                    }
                    void applySettings({
                      ...settings,
                      retention: { ...settings.retention, maxRuns: Math.round(maxRuns) },
                    });
                  }}
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Days
                <input
                  aria-label="Maximum run age in days"
                  className={selectClass}
                  inputMode="numeric"
                  size={5}
                  defaultValue={settings.retention.maxAgeDays}
                  disabled={busy}
                  onBlur={(event) => {
                    const maxAgeDays = Number(event.currentTarget.value.trim());
                    if (
                      !Number.isFinite(maxAgeDays) ||
                      maxAgeDays === settings.retention.maxAgeDays
                    ) {
                      return;
                    }
                    void applySettings({
                      ...settings,
                      retention: {
                        ...settings.retention,
                        maxAgeDays: Math.round(maxAgeDays),
                      },
                    });
                  }}
                />
              </label>
            </span>
          </div>
          <div className={settingsRow}>
            <span className={settingsRowLabel}>
              Clear history
              <span className={settingsRowDescription}>
                Deletes every recorded run and its prompt text from this device.
              </span>
            </span>
            <button
              type="button"
              className={cn(settingsButton, settingsButtonDanger)}
              disabled={busy}
              onClick={() => void clearHistory()}
              onBlur={() => setClearArmed(false)}
            >
              {clearArmed ? "Delete every run" : "Clear history"}
            </button>
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
