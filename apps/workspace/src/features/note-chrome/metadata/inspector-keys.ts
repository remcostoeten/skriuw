import type { KeyboardEvent } from "react";
import { focusRegion } from "@/commands/focus-regions";
import { sectionForNumberKey, stepIndex, type InspectorSection } from "./inspector-model";

const FOCUSABLE = "button, a[href], [tabindex='0']";

function isTextEntry(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}

function reachableRows(aside: HTMLElement): HTMLElement[] {
  return [...aside.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) =>
      !element.hasAttribute("data-inspector-skip") &&
      element.getAttribute("aria-checked") !== "false" &&
      element.closest("[inert]") === null &&
      element.getClientRects().length > 0,
  );
}

/**
 * @name inspectorKeyDown
 * @description Keyboard handling for the note inspector: Escape returns to the
 * note, a digit jumps to that section, and Up and Down walk every visible
 * header, row and button in the panel one step at a time.
 *
 * @example
 * <aside onKeyDown={(event) => inspectorKeyDown(event, visible, jump)} />
 */
export function inspectorKeyDown(
  event: KeyboardEvent<HTMLElement>,
  visible: readonly InspectorSection[],
  jump: (section: InspectorSection) => void,
): void {
  const aside = event.currentTarget;
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    !(event.target instanceof Node) ||
    !aside.contains(event.target) ||
    isTextEntry(event.target)
  ) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    focusRegion("editor");
    return;
  }
  const section = sectionForNumberKey(event.key, visible);
  if (section !== null) {
    event.preventDefault();
    jump(section);
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  event.preventDefault();
  const rows = reachableRows(aside);
  const active = document.activeElement;
  const index = active instanceof HTMLElement ? rows.indexOf(active) : -1;
  rows[stepIndex(rows.length, index, event.key === "ArrowDown" ? 1 : -1)]?.focus();
}
