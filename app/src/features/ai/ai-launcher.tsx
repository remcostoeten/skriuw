import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "prosemirror-view";
import { SparklesIcon } from "@/shared/icons/static";

/** What the launcher is doing, which is also what it says. */
export type AiLauncherState = "idle" | "menu" | "working" | "settled";

type Props = {
  state: AiLauncherState;
  getView: () => EditorView | null;
  onOpen: () => void;
};

const LABELS: Record<AiLauncherState, string> = {
  idle: "Ask AI",
  menu: "Ask AI",
  working: "Working…",
  settled: "Waiting on you",
};

/**
 * The standing way into AI. Until this existed the only visible entry point was
 * a button on the selection toolbar, so every note-wide action — summarise,
 * outline, extract tasks — was reachable only by selecting text those actions
 * then ignored, or by knowing the command palette entry existed.
 *
 * It lives in the editor pane rather than the window chrome so it is absent
 * exactly when AI is: the whole host is behind the opt-in gate.
 */
export function AiLauncher({ state, getView, onOpen }: Props) {
  const [pane, setPane] = useState<HTMLElement | null>(null);

  // The editor view is attached in an effect of its own, and this host has no
  // way to be told when. Polling briefly is cheaper than pushing the pane
  // element through the editor's props for one button, and it stops the moment
  // it finds one.
  useEffect(() => {
    const found = getView()?.dom.closest<HTMLElement>(".editor-pane") ?? null;
    if (found !== null) {
      setPane(found);
      return;
    }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const pane = getView()?.dom.closest<HTMLElement>(".editor-pane") ?? null;
      if (pane !== null || attempts > 20) {
        window.clearInterval(timer);
        setPane(pane);
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [getView]);

  if (pane === null) {
    return null;
  }

  return createPortal(
    <button
      type="button"
      className="ai-launcher"
      data-state={state}
      aria-label={state === "working" ? "AI is working" : LABELS[state]}
      aria-expanded={state === "menu"}
      disabled={state !== "idle" && state !== "menu"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      <span className="ai-launcher-icon" aria-hidden="true">
        <SparklesIcon size={14} />
      </span>
      <span className="ai-launcher-label">{LABELS[state]}</span>
    </button>,
    pane,
  );
}
