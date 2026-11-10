import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  formatVersionClock,
  formatVersionTimestamp,
  type VersionListItem,
} from "../versions/model";
import {
  describeWordDelta,
  formatSignedWords,
  stepVersionId,
  type LedgerRow,
} from "./ledger-model";

export type LedgerFocusRequest = {
  versionId: string;
  focus: boolean;
  nonce: number;
};

type Props = {
  versions: readonly VersionListItem[];
  rows: readonly LedgerRow[];
  openVersionId: string | null;
  focusRequest: LedgerFocusRequest | null;
  onOpen: (versionId: string) => void;
  onCopy: (versionId: string) => void;
  onWarm: (versionId: string) => void;
};

const DAY_ROW_HEIGHT = 36;
const VERSION_ROW_HEIGHT = 40;
const PAGE_STEP = 10;

function signOf(delta: number | null): "up" | "down" | "flat" | "none" {
  if (delta === null) {
    return "none";
  }
  if (delta === 0) {
    return "flat";
  }
  return delta > 0 ? "up" : "down";
}

function keyStep(event: KeyboardEvent, count: number): number | null {
  switch (event.key) {
    case "ArrowDown":
    case "j":
      return 1;
    case "ArrowUp":
    case "k":
      return -1;
    case "PageDown":
      return PAGE_STEP;
    case "PageUp":
      return -PAGE_STEP;
    case "Home":
      return -count;
    case "End":
      return count;
    default:
      return null;
  }
}

export function VersionLedger({
  versions,
  rows,
  openVersionId,
  focusRequest,
  onOpen,
  onCopy,
  onWarm,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [cursorId, setCursorId] = useState<string | null>(openVersionId);
  const [followedOpenId, setFollowedOpenId] = useState(openVersionId);
  if (followedOpenId !== openVersionId) {
    setFollowedOpenId(openVersionId);
    if (openVersionId !== null) {
      setCursorId(openVersionId);
    }
  }
  const tabStopId =
    versions.some((item) => item.versionId === cursorId) && cursorId !== null
      ? cursorId
      : (versions[0]?.versionId ?? null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => (rows[index]?.kind === "day" ? DAY_ROW_HEIGHT : VERSION_ROW_HEIGHT),
    overscan: 10,
  });

  function reveal(versionId: string, focus: boolean): void {
    setCursorId(versionId);
    const rowIndex = rows.findIndex(
      (row) => row.kind === "version" && row.item.versionId === versionId,
    );
    if (rowIndex === -1) {
      return;
    }
    virtualizer.scrollToIndex(rowIndex, { align: "auto" });
    if (!focus) {
      return;
    }
    const selector = `[data-version-id="${CSS.escape(versionId)}"]`;
    const button = scrollerRef.current?.querySelector<HTMLButtonElement>(selector);
    if (button) {
      button.focus({ preventScroll: true });
      return;
    }
    requestAnimationFrame(() => {
      scrollerRef.current
        ?.querySelector<HTMLButtonElement>(selector)
        ?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    if (focusRequest !== null) {
      reveal(focusRequest.versionId, focusRequest.focus);
    }
  }, [focusRequest]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, versionId: string): void {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "c" || event.key === "C") {
      event.preventDefault();
      onCopy(versionId);
      return;
    }
    const step = keyStep(event, versions.length);
    if (step === null) {
      return;
    }
    event.preventDefault();
    const next = stepVersionId(versions, versionId, step);
    if (next !== null && next !== versionId) {
      onWarm(next);
      reveal(next, true);
    }
  }

  return (
    <div
      ref={scrollerRef}
      role="listbox"
      aria-label="Revisions"
      aria-describedby="history-keyboard-help"
      className="history-ledger relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:thin]"
    >
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) {
            return null;
          }
          const style = {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: virtualRow.size,
            transform: `translateY(${virtualRow.start}px)`,
          } as const;

          if (row.kind === "day") {
            return (
              <div key={row.key} style={style} role="presentation" className="history-day">
                <span className="history-day-label">{row.label}</span>
                <span className="history-day-count">{row.count}</span>
                <span
                  className="history-day-net"
                  data-sign={signOf(row.netDelta)}
                  title={row.netDelta === null ? undefined : "Net change that day, in words"}
                >
                  {row.netDelta === null ? "" : `${formatSignedWords(row.netDelta)} words`}
                </span>
              </div>
            );
          }

          const { item } = row;
          const open = item.versionId === openVersionId;
          return (
            <div key={row.key} style={style}>
              <button
                type="button"
                role="option"
                aria-selected={open}
                aria-posinset={row.index + 1}
                aria-setsize={versions.length}
                aria-keyshortcuts="Enter C"
                data-version-id={item.versionId}
                data-last={row.lastOfDay}
                tabIndex={item.versionId === tabStopId ? 0 : -1}
                className="history-row"
                title={formatVersionTimestamp(item.createdAt)}
                onClick={() => {
                  setCursorId(item.versionId);
                  onOpen(item.versionId);
                }}
                onFocus={() => setCursorId(item.versionId)}
                onPointerEnter={() => onWarm(item.versionId)}
                onKeyDown={(event) => handleKeyDown(event, item.versionId)}
              >
                <span className="history-row-time">{formatVersionClock(item.createdAt)}</span>
                <span className="history-row-summary">{item.summary}</span>
                <span
                  aria-hidden="true"
                  className="history-meter"
                  data-sign={signOf(item.wordDelta)}
                >
                  <span
                    className="history-meter-fill"
                    data-sign={signOf(item.wordDelta)}
                    style={{ transform: `scaleX(${row.magnitude})` }}
                  />
                </span>
                <span
                  className="history-row-delta"
                  data-sign={signOf(item.wordDelta)}
                  title={describeWordDelta(item.wordDelta)}
                >
                  {formatSignedWords(item.wordDelta)}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
