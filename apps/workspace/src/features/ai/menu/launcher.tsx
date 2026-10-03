import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "prosemirror-view";
import { SparklesIcon } from "@/shared/icons/static";

type AiLauncherState = "idle" | "menu" | "working" | "settled";

type AiLauncherProps = {
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
export function AiLauncher({ state, getView, onOpen }: AiLauncherProps) {
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
      className="group absolute right-[14px] bottom-[14px] z-30 flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full border border-[hsl(var(--editor-link)/0.35)] bg-[linear-gradient(hsl(var(--editor-link)/0.14),hsl(var(--editor-link)/0.08)),hsl(var(--popover))] pr-[11px] pl-[9px] font-sans text-[12px] font-[560] text-[hsl(var(--editor-link))] shadow-[0_8px_22px_hsl(var(--scrim)/0.3)] transition-[background-color,border-color,color,box-shadow] duration-140 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))] disabled:cursor-default data-[state=menu]:border-[hsl(var(--editor-link)/0.7)] data-[state=menu]:bg-[linear-gradient(hsl(var(--editor-link)/0.24),hsl(var(--editor-link)/0.16)),hsl(var(--popover))] [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:border-[hsl(var(--editor-link)/0.6)] [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:bg-[linear-gradient(hsl(var(--editor-link)/0.24),hsl(var(--editor-link)/0.16)),hsl(var(--popover))] [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:shadow-[0_10px_26px_hsl(var(--scrim)/0.36)]"
      data-state={state}
      aria-label={state === "working" ? "AI is working" : LABELS[state]}
      aria-expanded={state === "menu"}
      disabled={state !== "idle" && state !== "menu"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      <span
        className="flex group-data-[state=working]:animate-[ai-launcher-pulse_1.6s_ease-in-out_infinite]"
        aria-hidden="true"
      >
        <SparklesIcon size={14} />
      </span>
      <span>{LABELS[state]}</span>
    </button>,
    pane,
  );
}
