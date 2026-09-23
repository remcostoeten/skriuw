import type { MediaUploadState } from "./media-upload-state";

export type TouchAction = {
  label: string;
  run: (anchor: HTMLElement) => void;
};

const BUTTON_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-[13px] font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";

/** True on devices whose primary pointer cannot hover or right-click reliably. */
export function prefersTouchActions(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

function touchButton(action: TouchAction): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.textContent = action.label;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action.run(button);
  });
  return button;
}

/**
 * Floating toolbar of 44px targets shown over a selected media node on touch
 * devices, where long-press `contextmenu` is unreliable.
 */
export function createTouchActionBar(actions: readonly TouchAction[]): HTMLElement {
  const bar = document.createElement("span");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Media actions");
  bar.contentEditable = "false";
  bar.dataset.mediaActions = "true";
  bar.className =
    "absolute left-1/2 top-2 z-10 flex -translate-x-1/2 gap-1 rounded-lg border border-border bg-popover p-1 shadow-md";
  bar.append(...actions.map(touchButton));
  return bar;
}

/**
 * Status panel for a media node whose blob is still saving or failed to save.
 * Failed uploads always offer Remove, and Retry when retrying can help.
 */
export function createUploadStatus(state: MediaUploadState, onRemove: () => void): HTMLElement {
  const panel = document.createElement("span");
  panel.contentEditable = "false";
  panel.dataset.uploadStatus = state.status;
  panel.setAttribute("role", state.status === "failed" ? "alert" : "status");
  panel.className =
    "flex min-h-18 flex-col items-start gap-2 rounded-md border border-dashed border-border p-3 text-[13px] text-muted-foreground";
  const text = document.createElement("span");
  text.textContent = state.status === "saving" ? state.label : state.message;
  panel.append(text);
  if (state.status === "failed") {
    const actions = document.createElement("span");
    actions.className = "flex gap-2";
    const retry = state.retry;
    if (retry) {
      actions.append(touchButton({ label: "Retry", run: () => retry() }));
    }
    actions.append(touchButton({ label: "Remove", run: () => onRemove() }));
    panel.append(actions);
  }
  return panel;
}
