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
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { noop } from "@/shared/lib/noop";

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
 * over a very long block runs on every edit to that block and would stall
 * typing far more visibly than the missing colours cost.
 */
const MAX_HIGHLIGHT_LENGTH = 30000;

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
  const tokens = text.length > MAX_HIGHLIGHT_LENGTH
    ? NO_TOKENS
    : highlightCode(String(node.attrs.params ?? ""), text);
  tokenCache.set(node, tokens);
  return tokens;
}

export function codeHighlightDecorations(doc: ProseMirrorNode): Decoration[] {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return node.isBlock;
    const start = pos + 1;
    for (const token of codeBlockTokens(node)) {
      decorations.push(
        Decoration.inline(start + token.from, start + token.to, { class: token.className }),
      );
    }
    return false;
  });
  return decorations;
}

export const codeHighlightKey = new PluginKey<DecorationSet>("skriuw-code-highlight");

export function createCodeHighlightPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: codeHighlightKey,
    state: {
      init: (_config, state) =>
        DecorationSet.create(state.doc, codeHighlightDecorations(state.doc)),
      apply: (transaction, previous) =>
        transaction.docChanged
          ? DecorationSet.create(transaction.doc, codeHighlightDecorations(transaction.doc))
          : previous,
    },
    props: {
      decorations: (state) => codeHighlightKey.getState(state) ?? DecorationSet.empty,
    },
  });
}
