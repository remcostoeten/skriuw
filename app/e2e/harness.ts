import type { RendererStore } from "../src/store/types";
import { failNextBridgeCall, readBridgeCalls } from "./bridge-mock";

type WorkflowState = {
  activeNoteId: string | null;
  focusedNodeId: string | null;
  nodeTitles: Record<string, string>;
  parents: Record<string, string | null>;
  nodeOrder: string[];
  deleted: string[];
  tags: Record<string, string>;
  people: Record<string, string>;
  settings: Record<string, unknown>;
  bridgeCommands: string[];
  route: string;
  activeElement: string;
  dialog: string | null;
  statusText: string[];
};

function normalizedText(element: Element): string {
  return element.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}

function elementName(element: Element): string {
  return (
    element.getAttribute("aria-label") ??
    element.getAttribute("placeholder") ??
    normalizedText(element)
  );
}

function interactiveElements(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, [role='tree'], [role='option'], [role='menuitem'], a[href]",
    ),
  ].filter((element) => !element.hasAttribute("disabled"));
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function retainFocus(element: HTMLElement): Promise<void> {
  element.focus();
  await nextPaint();
  if (element.isConnected) {
    element.focus();
  }
}

export function createWorkflowController(store: RendererStore) {
  async function focusNamed(name: string): Promise<string> {
    const match = interactiveElements().find((element) => elementName(element) === name);
    if (!match) {
      throw new Error(`interactive element not found: ${name}`);
    }
    await retainFocus(match);
    return elementName(match);
  }

  async function focusLastNamed(name: string): Promise<string> {
    const matches = interactiveElements().filter((element) => elementName(element) === name);
    const match = matches.at(-1);
    if (!match) {
      throw new Error(`interactive element not found: ${name}`);
    }
    await retainFocus(match);
    return elementName(match);
  }

  async function focusContaining(text: string): Promise<string> {
    const match = interactiveElements().find((element) => elementName(element).includes(text));
    if (!match) {
      throw new Error(`interactive element containing text not found: ${text}`);
    }
    await retainFocus(match);
    return elementName(match);
  }

  async function focusTree(id: string): Promise<string> {
    store.setFocusedNode(id);
    await nextPaint();
    const tree = document.querySelector<HTMLElement>("[role='tree']");
    if (!tree) {
      throw new Error("workspace tree not found");
    }
    await retainFocus(tree);
    return id;
  }

  async function focusSelector(selector: string): Promise<string> {
    const match = document.querySelector<HTMLElement>(selector);
    if (!match) {
      throw new Error(`interactive selector not found: ${selector}`);
    }
    await retainFocus(match);
    return elementName(match);
  }

  async function focusLabel(text: string): Promise<string> {
    const label = [...document.querySelectorAll("label")].find((entry) =>
      normalizedText(entry).includes(text),
    );
    const match = label?.querySelector<HTMLElement>("input, select, textarea, button");
    if (!match) {
      throw new Error(`labelled control not found: ${text}`);
    }
    await retainFocus(match);
    return label ? normalizedText(label) : elementName(match);
  }

  async function focusEditor(): Promise<string> {
    const editor = document.querySelector<HTMLElement>(".ProseMirror[contenteditable='true']");
    if (!editor) {
      throw new Error("editable ProseMirror surface not found");
    }
    await retainFocus(editor);
    const selection = window.getSelection();
    selection?.selectAllChildren(editor);
    selection?.collapseToEnd();
    return normalizedText(editor);
  }

  async function focusRow(id: string): Promise<string> {
    store.setFocusedNode(id);
    await nextPaint();
    const row = document.querySelector<HTMLElement>(
      `[data-row-key="${CSS.escape(id)}"]`,
    );
    if (!row) {
      throw new Error(`workspace row not found: ${id}`);
    }
    await retainFocus(row);
    return id;
  }

  function state(): WorkflowState {
    const current = store.getState();
    return {
      activeNoteId: current.activeNoteId,
      focusedNodeId: current.focusedNodeId,
      nodeTitles: Object.fromEntries(
        [...current.sourceNodes].map(([id, node]) => [id, node.title]),
      ),
      parents: Object.fromEntries(
        [...current.sourceNodes].map(([id, node]) => [id, node.parentId]),
      ),
      nodeOrder: [...current.nodeOrder],
      deleted: [...current.sourceNodes.values()]
        .filter((node) => node.deletedAt !== null)
        .map((node) => node.id)
        .sort(),
      tags: Object.fromEntries(
        [...current.tags.values()].map((tag) => [tag.id, tag.name]),
      ),
      people: Object.fromEntries(
        [...current.people.values()].map((person) => [person.id, person.name]),
      ),
      settings: structuredClone(current.settings),
      bridgeCommands: readBridgeCalls().map((call) => call.command),
      route: window.location.hash,
      activeElement:
        document.activeElement instanceof Element ? elementName(document.activeElement) : "",
      dialog:
        document.querySelector("[role='dialog'][aria-label]")?.getAttribute("aria-label") ??
        document.querySelector("dialog[open] h2")?.textContent?.trim() ??
        null,
      statusText: [...document.querySelectorAll("[role='status'], [role='alert']")]
        .map(normalizedText)
        .filter(Boolean),
    };
  }

  return {
    focusNamed,
    focusLastNamed,
    focusContaining,
    focusSelector,
    focusLabel,
    focusEditor,
    focusTree,
    focusRow,
    failNext: (command: string, message: string) => {
      failNextBridgeCall(command, message);
    },
    state,
    settle: nextPaint,
  };
}

export type WorkflowController = ReturnType<typeof createWorkflowController>;
