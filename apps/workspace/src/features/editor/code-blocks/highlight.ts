import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { noop } from "@skriuw/shared/helpers/noop";
import { changedRanges } from "../changed-ranges";

export type CodeToken = {
  from: number;
  to: number;
  className: string;
};

export type CodeLanguageOption = {
  value: string;
  label: string;
};

type HighlightNode = {
  type: string;
  value?: string;
  children?: HighlightNode[];
  properties?: { className?: unknown };
};

/**
 * Only a curated grammar set is registered: highlight.js ships close to two
 * hundred grammars and pulling all of them in would roughly double the desktop
 * bundle for languages nobody writes notes in.
 */
const lowlight = createLowlight({
  bash,
  css,
  diff,
  go,
  javascript,
  json,
  markdown,
  plaintext,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
});

lowlight.registerAlias({
  bash: ["shell", "zsh", "console"],
  plaintext: ["text", "plain"],
  xml: ["vue"],
});

export const CODE_LANGUAGES: readonly CodeLanguageOption[] = [
  { value: "", label: "Plain text" },
  { value: "bash", label: "Bash" },
  { value: "css", label: "CSS" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "html", label: "HTML" },
  { value: "js", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "jsx", label: "JSX" },
  { value: "markdown", label: "Markdown" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "ts", label: "TypeScript" },
  { value: "tsx", label: "TSX" },
  { value: "yaml", label: "YAML" },
];

const NO_TOKENS: readonly CodeToken[] = [];

const SHELL_LANGUAGES = new Set(["bash", "shell", "zsh", "console", "sh"]);

const SHELL_COMMAND_PATTERN = /(^[ \t]*(?:\$[ \t]+)?|[;&|][ \t]*)([A-Za-z_.~/][\w.+~/-]*)/gm;

/**
 * highlight.js's bash grammar only colours built-ins, keywords, strings and
 * variables, so a plain invocation like `bun run dev` produces no tokens at
 * all. This pass colours the command word that opens each line or pipeline
 * segment, skipping ranges lowlight already claimed (comments, strings) and
 * variable assignments.
 */
function shellCommandTokens(code: string, claimed: readonly CodeToken[]): CodeToken[] {
  const tokens: CodeToken[] = [];
  for (const match of code.matchAll(SHELL_COMMAND_PATTERN)) {
    const [, prefix = "", word = ""] = match;
    if (!word) continue;
    const from = match.index + prefix.length;
    const to = from + word.length;
    if (code[to] === "=") continue;
    if (claimed.some((token) => token.from < to && token.to > from)) continue;
    tokens.push({ from, to, className: "hljs-title" });
  }
  return tokens;
}

/**
 * Code blocks past this size are left unhighlighted: a single lowlight pass
 * over a very long block is one long main-thread task after every pause in
 * typing, which costs more than the missing colours.
 */
const MAX_HIGHLIGHT_LENGTH = 30000;
const REFRESH_DELAY_MS = 100;
const INIT_BUDGET_MS = 4;

export function codeLanguageLabel(params: string): string {
  const normalized = normalizeLanguage(params);
  const known = CODE_LANGUAGES.find((option) => option.value === normalized);
  return known?.label ?? (normalized || "Plain text");
}

function normalizeLanguage(params: string): string {
  return params.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/**
 * Resolves a fence info string to a registered grammar, or `null` when the
 * language is empty, unknown, or deliberately unhighlighted.
 */
export function resolveHighlightLanguage(params: string): string | null {
  const normalized = normalizeLanguage(params);
  if (!normalized || normalized === "plaintext" || normalized === "text") {
    return null;
  }
  return lowlight.registered(normalized) ? normalized : null;
}

function elementClassName(node: HighlightNode): string | null {
  const raw = node.properties?.className;
  if (typeof raw === "string") return raw || null;
  if (!Array.isArray(raw)) return null;
  const joined = raw.filter((entry) => typeof entry === "string").join(" ");
  return joined || null;
}

function collectTokens(
  children: readonly HighlightNode[],
  offset: number,
  className: string | null,
  tokens: CodeToken[],
): number {
  let cursor = offset;
  for (const child of children) {
    if (child.type === "text") {
      const length = child.value?.length ?? 0;
      if (className && length > 0) {
        tokens.push({ from: cursor, to: cursor + length, className });
      }
      cursor += length;
      continue;
    }
    if (child.type === "element") {
      cursor = collectTokens(
        child.children ?? [],
        cursor,
        elementClassName(child) ?? className,
        tokens,
      );
    }
  }
  return cursor;
}

/**
 * Highlights `code` as `params`, returning offsets relative to the start of the
 * code text. An unknown language yields no tokens rather than throwing.
 */
export function highlightCode(params: string, code: string): readonly CodeToken[] {
  const language = resolveHighlightLanguage(params);
  if (!language || code.length === 0) return NO_TOKENS;
  let tree: HighlightNode;
  try {
    tree = lowlight.highlight(language, code) as HighlightNode;
  } catch {
    noop();
    return NO_TOKENS;
  }
  const tokens: CodeToken[] = [];
  collectTokens(tree.children ?? [], 0, null, tokens);
  if (SHELL_LANGUAGES.has(language)) {
    tokens.push(...shellCommandTokens(code, tokens));
  }
  return tokens;
}

const tokenCache = new WeakMap<ProseMirrorNode, readonly CodeToken[]>();

/**
 * Memoised per code_block node. ProseMirror shares node instances across
 * transactions that leave them untouched, so an edit anywhere in the document
 * re-runs lowlight only for the block whose text actually changed.
 */
export function codeBlockTokens(node: ProseMirrorNode): readonly CodeToken[] {
  const cached = tokenCache.get(node);
  if (cached) return cached;
  const text = node.textContent;
  const tokens =
    text.length > MAX_HIGHLIGHT_LENGTH
      ? NO_TOKENS
      : highlightCode(String(node.attrs.params ?? ""), text);
  tokenCache.set(node, tokens);
  return tokens;
}

function blockDecorations(node: ProseMirrorNode, pos: number): Decoration[] {
  const start = pos + 1;
  return codeBlockTokens(node).map((token) =>
    Decoration.inline(start + token.from, start + token.to, { class: token.className }),
  );
}

export function codeHighlightDecorations(doc: ProseMirrorNode): Decoration[] {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return node.isBlock;
    for (const decoration of blockDecorations(node, pos)) decorations.push(decoration);
    return false;
  });
  return decorations;
}

export type CodeHighlightState = {
  decorations: DecorationSet;
  pending: readonly number[];
};

export const codeHighlightKey = new PluginKey<CodeHighlightState>("skriuw-code-highlight");

const REFRESH = "refresh";

function initialCodeHighlight(doc: ProseMirrorNode): CodeHighlightState {
  const decorations: Decoration[] = [];
  const pending: number[] = [];
  const started = performance.now();
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return node.isBlock;
    if (tokenCache.has(node) || performance.now() - started < INIT_BUDGET_MS) {
      for (const decoration of blockDecorations(node, pos)) decorations.push(decoration);
    } else {
      pending.push(pos);
    }
    return false;
  });
  return { decorations: DecorationSet.create(doc, decorations), pending };
}

function rehighlightBlock(
  set: DecorationSet,
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number,
): DecorationSet {
  const cleared = set.remove(set.find(pos + 1, pos + node.nodeSize - 1));
  return node.type.name === "code_block" ? cleared.add(doc, blockDecorations(node, pos)) : cleared;
}

function refreshPending(previous: CodeHighlightState, doc: ProseMirrorNode): CodeHighlightState {
  if (previous.pending.length === 0) return previous;
  let set = previous.decorations;
  for (const pos of previous.pending) {
    const node = doc.nodeAt(pos);
    if (node?.type.name === "code_block") set = rehighlightBlock(set, doc, node, pos);
  }
  return { decorations: set, pending: [] };
}

/**
 * @name nextCodeHighlight
 * @description Advances the code highlight state across a transaction. The
 * previous decorations are mapped and only the textblocks the transaction
 * touched are re-decorated. A touched code block whose node was highlighted
 * before (such as after undoing a paste) is re-decorated at once; an edited
 * one keeps its mapped decorations and is queued until the refresh
 * transaction, so typing never waits for lowlight. Returns `previous` itself when nothing changed.
 *
 * @example
 * apply: (transaction, previous) => nextCodeHighlight(previous, transaction)
 */
export function nextCodeHighlight(
  previous: CodeHighlightState,
  transaction: Transaction,
): CodeHighlightState {
  const { doc } = transaction;
  if (transaction.getMeta(codeHighlightKey) === REFRESH) return refreshPending(previous, doc);
  if (!transaction.docChanged) return previous;
  const size = doc.content.size;
  const pending = new Set<number>();
  for (const pos of previous.pending) {
    const mapped = transaction.mapping.mapResult(pos, 1);
    if (!mapped.deleted) pending.add(mapped.pos);
  }
  const handled = new Set<number>();
  let set = previous.decorations.map(transaction.mapping, doc);
  for (const range of changedRanges(transaction)) {
    doc.nodesBetween(Math.max(0, range.from - 1), Math.min(size, range.to + 1), (node, pos) => {
      if (!node.isTextblock) return node.isBlock;
      if (handled.has(pos)) return false;
      handled.add(pos);
      if (node.type.name === "code_block" && !tokenCache.has(node)) {
        pending.add(pos);
        return false;
      }
      pending.delete(pos);
      set = rehighlightBlock(set, doc, node, pos);
      return false;
    });
  }
  return { decorations: set, pending: [...pending] };
}

/**
 * @name codeHighlightRefresh
 * @description The transaction that re-highlights every code block queued by
 * earlier edits. It records no history.
 *
 * @example
 * view.dispatch(codeHighlightRefresh(view.state));
 */
export function codeHighlightRefresh(state: EditorState): Transaction {
  return state.tr.setMeta(codeHighlightKey, REFRESH).setMeta("addToHistory", false);
}

function hasPendingHighlight(state: EditorState): boolean {
  return (codeHighlightKey.getState(state)?.pending.length ?? 0) > 0;
}

export function createCodeHighlightPlugin(): Plugin<CodeHighlightState> {
  return new Plugin<CodeHighlightState>({
    key: codeHighlightKey,
    state: {
      init: (_config, state) => initialCodeHighlight(state.doc),
      apply: (transaction, previous) => nextCodeHighlight(previous, transaction),
    },
    props: {
      decorations: (state) => codeHighlightKey.getState(state)?.decorations ?? DecorationSet.empty,
    },
    view: (editorView) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      function schedule() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        if (!hasPendingHighlight(editorView.state)) return;
        timer = setTimeout(() => {
          timer = null;
          if (hasPendingHighlight(editorView.state)) {
            editorView.dispatch(codeHighlightRefresh(editorView.state));
          }
        }, REFRESH_DELAY_MS);
      }
      schedule();
      return {
        update: (view, previousState) => {
          if (view.state.doc !== previousState.doc || timer === null) schedule();
        },
        destroy: () => {
          if (timer !== null) clearTimeout(timer);
        },
      };
    },
  });
}
