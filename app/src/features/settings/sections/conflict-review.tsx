import { useState } from "react";
import {
  type DocumentConflict,
  type DocumentConflictVersions,
  type SyncConflictReview,
  readSyncConflictVersions,
  resolveSyncConflict,
} from "@/bridge/commands";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import {
  settingsButton,
  settingsGroup,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
} from "./settings-shared";
import { conflictCauseText, conflictOutcomeText, versionPreview } from "./sync-conflicts";

type Props = {
  review: SyncConflictReview | null;
  error: string | null;
  onResolved: (review: SyncConflictReview) => void;
  onError: (message: string) => void;
};

export function ConflictReview({ review, error, onResolved, onError }: Props) {
  const open = review?.open ?? [];
  const settled = review?.settled ?? [];
  if (!error && open.length === 0 && settled.length === 0) return null;
  return (
    <>
      {error || open.length > 0 ? (
        <div className={settingsGroup} role="region" aria-label="Sync conflicts">
          <div className={settingsGroupTitle}>Conflicts</div>
          {error ? (
            <p role="alert" className="m-0 py-1.5 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}
          <ul className="m-0 list-none p-0" aria-live="polite">
            {open.map((item) => (
              <ConflictRow
                key={item.conflictId}
                item={item}
                onResolved={onResolved}
                onError={onError}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {settled.length > 0 ? (
        <div className={settingsGroup} role="region" aria-label="Settled sync conflicts">
          <div className={settingsGroupTitle}>Settled conflicts</div>
          <ul className="m-0 list-none p-0">
            {settled.map((item) => (
              <li key={item.conflictId} className={settingsRow}>
                <span className={settingsRowLabel}>
                  {item.title}
                  <span className={settingsRowDescription}>
                    {conflictOutcomeText(item)}{" "}
                    {item.resolvedAt === null
                      ? null
                      : `Settled ${formatRelativeTime(item.resolvedAt)}.`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

type RowProps = {
  item: DocumentConflict;
  onResolved: (review: SyncConflictReview) => void;
  onError: (message: string) => void;
};

type VersionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; versions: DocumentConflictVersions };

function ConflictRow({ item, onResolved, onError }: RowProps) {
  const [versions, setVersions] = useState<VersionsState>({ status: "idle" });
  const [busy, setBusy] = useState(false);

  function toggle(): void {
    if (versions.status !== "idle") {
      setVersions({ status: "idle" });
      return;
    }
    setVersions({ status: "loading" });
    readSyncConflictVersions(item.conflictId).then(
      (loaded) => setVersions({ status: "ready", versions: loaded }),
      (loadError: unknown) => {
        setVersions({ status: "idle" });
        onError(loadError instanceof Error ? loadError.message : String(loadError));
      },
    );
  }

  function keep(choice: "keepLocal" | "keepRemote"): void {
    setBusy(true);
    resolveSyncConflict(item.conflictId, { choice }, Date.now()).then(
      (next) => {
        setBusy(false);
        onResolved(next);
      },
      (resolveError: unknown) => {
        setBusy(false);
        onError(resolveError instanceof Error ? resolveError.message : String(resolveError));
      },
    );
  }

  return (
    <li className="border-b border-border/40 last:border-b-0">
      <div className={settingsRow}>
        <span className={settingsRowLabel}>
          {item.title}
          <span className={settingsRowDescription}>
            {conflictCauseText(item)} Kept {formatRelativeTime(item.createdAt)}.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className={settingsButton}
            aria-expanded={versions.status === "ready"}
            onClick={toggle}
          >
            {versions.status === "loading"
              ? "Opening…"
              : versions.status === "ready"
                ? "Hide versions"
                : "Compare"}
          </button>
        </span>
      </div>
      {versions.status === "ready" ? (
        <div className="grid gap-2 pb-2.5 sm:grid-cols-2">
          <VersionCard
            heading="This device"
            markdown={versions.versions.local?.markdown ?? null}
            actionLabel="Keep this"
            disabled={busy || !item.localVersionAvailable}
            onKeep={() => keep("keepLocal")}
          />
          <VersionCard
            heading="Other device"
            markdown={versions.versions.remote.markdown}
            actionLabel="Keep this"
            disabled={busy}
            onKeep={() => keep("keepRemote")}
          />
        </div>
      ) : null}
    </li>
  );
}

type VersionCardProps = {
  heading: string;
  markdown: string | null;
  actionLabel: string;
  disabled: boolean;
  onKeep: () => void;
};

function VersionCard({ heading, markdown, actionLabel, disabled, onKeep }: VersionCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[var(--radius)] border border-border/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {heading}
        </span>
        <button type="button" className={settingsButton} disabled={disabled} onClick={onKeep}>
          {actionLabel}
        </button>
      </div>
      <p className="m-0 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-[12px] text-foreground">
        {markdown === null ? "This version could not be preserved." : versionPreview(markdown)}
      </p>
    </div>
  );
}
