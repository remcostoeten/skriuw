import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { RendererState } from "../store/types";
import type {
  MentionContext,
  MentionMenuItem,
} from "./mention-plugin";
import {
  acceptMentionItem,
  mentionMenuItems,
  mentionState,
  normalizedMentionIndex,
  mentionPluginKey,
} from "./mention-plugin";

type MenuView = {
  update: (view: EditorView, previousState: EditorState) => void;
  destroy: () => void;
};

const GROUP_LABELS: Record<string, string> = {
  tags: "Tags",
  people: "People",
  notes: "Notes",
};

const CREATE_LABELS: Record<"tag" | "person" | "note", string> = {
  tag: "Create tag",
  person: "Create person",
  note: "Create note",
};

function optionLabel(item: MentionMenuItem): string {
  if (item.type === "create") {
    return `${CREATE_LABELS[item.kind]} "${item.name}"`;
  }
  const prefix =
    item.suggestion.kind === "tag" ? "#" : item.suggestion.kind === "person" ? "$" : "@";
  return `${prefix}${item.suggestion.label}`;
}

function suggestionColor(state: RendererState, item: MentionMenuItem): string | null {
  if (item.type !== "suggestion") {
    return null;
  }
  if (item.suggestion.kind === "tag") {
    return state.tags.get(item.suggestion.id)?.color ?? null;
  }
  if (item.suggestion.kind === "person") {
    return state.people.get(item.suggestion.id)?.color ?? null;
  }
  return null;
}

export function createMentionMenu(view: EditorView, context: MentionContext): MenuView {
  const root = view.dom.ownerDocument.createElement("div");
  root.className = "mention-menu";
  root.setAttribute("role", "listbox");
  root.setAttribute("aria-label", "Reference suggestions");
  root.hidden = true;
  const status = view.dom.ownerDocument.createElement("div");
  status.className = "mention-menu-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const host = view.dom.parentElement ?? view.dom.ownerDocument.body;
  host.append(root, status);

  function close(): void {
    root.hidden = true;
    root.replaceChildren();
    status.textContent = "";
    view.dom.removeAttribute("aria-activedescendant");
  }

  function render(): void {
    const current = mentionState(view.state);
    if (!current.active) {
      close();
      return;
    }
    const rendererState = context.getState();
    const items = mentionMenuItems(rendererState, current.trigger, current.query);
    const selected = normalizedMentionIndex(current.index, items.length);
    root.classList.toggle("is-reduced-motion", rendererState.settings.reduceMotion === true);
    root.replaceChildren();
    if (items.length === 0) {
      const empty = view.dom.ownerDocument.createElement("div");
      empty.className = "mention-menu-empty";
      empty.setAttribute("role", "option");
      empty.setAttribute("aria-disabled", "true");
      empty.setAttribute("aria-selected", "false");
      empty.textContent = "No matches";
      root.append(empty);
      status.textContent = "No matches";
    } else {
      let renderedGroup = "";
      items.forEach((item, index) => {
        const group = item.type === "create" ? "" : item.group;
        if (group && group !== renderedGroup) {
          renderedGroup = group;
          const heading = view.dom.ownerDocument.createElement("div");
          heading.className = "mention-menu-group";
          heading.setAttribute("aria-hidden", "true");
          heading.textContent = GROUP_LABELS[group] ?? group;
          root.append(heading);
        }
        const option = view.dom.ownerDocument.createElement("button");
        option.type = "button";
        option.id = `mention-option-${index}`;
        option.className = "mention-menu-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", index === selected ? "true" : "false");
        option.classList.toggle("is-selected", index === selected);
        option.classList.toggle("is-create", item.type === "create");
        const color = suggestionColor(rendererState, item);
        if (color) {
          const swatch = view.dom.ownerDocument.createElement("span");
          swatch.className = "mention-menu-swatch";
          swatch.setAttribute("aria-hidden", "true");
          swatch.style.backgroundColor = color;
          const label = view.dom.ownerDocument.createElement("span");
          label.textContent = optionLabel(item);
          option.append(swatch, label);
        } else {
          option.textContent = optionLabel(item);
        }
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          acceptMentionItem(view, item, context);
        });
        root.append(option);
      });
      status.textContent = `${items.length} suggestion${items.length === 1 ? "" : "s"}`;
      view.dom.setAttribute("aria-activedescendant", `mention-option-${selected}`);
    }
    const coords = view.coordsAtPos(current.to);
    root.style.left = `${coords.left}px`;
    root.style.top = `${coords.bottom + 4}px`;
    root.hidden = false;
  }

  render();
  return {
    update(_view, previousState) {
      const previous = mentionPluginKey.getState(previousState);
      const current = mentionState(view.state);
      if (!current.active && !(previous?.active ?? false)) {
        return;
      }
      render();
    },
    destroy() {
      root.remove();
      status.remove();
    },
  };
}
