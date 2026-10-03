import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src");
const DIALOG_DIR = join(SRC_DIR, "features/settings-dialog");

export const SETTINGS_SEARCH_COPY_PATH = join(DIALOG_DIR, "search-copy.generated.ts");

const COPY_ATTRIBUTES = new Set([
  "label",
  "detail",
  "description",
  "title",
  "hint",
  "placeholder",
  "aria-label",
  "confirmLabel",
]);
const COPY_PROPERTIES = new Set(["label", "detail", "description", "title", "hint"]);

type AstNode = { type: string; [key: string]: unknown };

function sectionDirectoryFiles(section: string): string[] {
  const directory = join(DIALOG_DIR, section);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".tsx"))
    .sort()
    .map((name) => join(directory, name));
}

function sectionSources(): [string, string[]][] {
  return [
    ["appearance", sectionDirectoryFiles("appearance")],
    ["editor", sectionDirectoryFiles("editor")],
    ["ai", sectionDirectoryFiles("ai")],
    ["shortcuts", sectionDirectoryFiles("shortcuts")],
    ["media", [join(SRC_DIR, "features/media/media-library-section.tsx")]],
    ["account", sectionDirectoryFiles("account")],
    ["lock", sectionDirectoryFiles("lock")],
    ["data", sectionDirectoryFiles("data")],
    ["about", sectionDirectoryFiles("about")],
  ];
}

function isNode(value: unknown): value is AstNode {
  return value !== null && typeof value === "object" && "type" in value;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&hellip;": "…",
};

function normalizeCopy(text: string): string {
  return text
    .replace(/&[a-z]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function isCopy(text: string): boolean {
  return /[a-z]{2}/i.test(text) && !/^[a-z]+(-[a-z0-9]+)+$/.test(text);
}

function staticText(node: unknown): string[] {
  if (!isNode(node)) {
    return [];
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return [node.value];
  }
  if (node.type === "TemplateLiteral" && Array.isArray(node.quasis)) {
    return node.quasis.flatMap((quasi) =>
      isNode(quasi) && isNode(quasi.value) && typeof quasi.value.cooked === "string"
        ? [quasi.value.cooked]
        : [],
    );
  }
  if (node.type === "JSXExpressionContainer") {
    return staticText(node.expression);
  }
  if (node.type === "ConditionalExpression") {
    return [...staticText(node.consequent), ...staticText(node.alternate)];
  }
  if (node.type === "LogicalExpression") {
    return staticText(node.right);
  }
  return [];
}

function attributeName(node: AstNode): string | undefined {
  return isNode(node.name) && typeof node.name.name === "string" ? node.name.name : undefined;
}

function propertyName(node: AstNode): string | undefined {
  if (!isNode(node.key)) {
    return undefined;
  }
  if (node.key.type === "Identifier" && typeof node.key.name === "string") {
    return node.key.name;
  }
  return node.key.type === "Literal" && typeof node.key.value === "string"
    ? node.key.value
    : undefined;
}

function collectCopy(node: unknown, into: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectCopy(child, into);
    return;
  }
  if (!isNode(node)) {
    return;
  }
  if (node.type === "JSXText" && typeof node.value === "string") {
    into.push(node.value);
  } else if (node.type === "JSXAttribute") {
    const name = attributeName(node);
    if (name && COPY_ATTRIBUTES.has(name)) {
      into.push(...staticText(node.value));
    }
    return;
  } else if (node.type === "Property") {
    const name = propertyName(node);
    if (name && COPY_PROPERTIES.has(name)) {
      into.push(...staticText(node.value));
    }
  } else if (node.type === "JSXExpressionContainer") {
    into.push(...staticText(node.expression));
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "type" && value !== null && typeof value === "object") {
      collectCopy(value, into);
    }
  }
}

function fileCopy(path: string): string[] {
  const result = parseSync(path, readFileSync(path, "utf8"));
  if (result.errors.length > 0) {
    throw new Error(`Cannot parse ${path}: ${result.errors[0]?.message}`);
  }
  const copy: string[] = [];
  collectCopy(result.program, copy);
  return copy;
}

function sectionCopy(files: readonly string[]): string[] {
  const phrases = new Set<string>();
  for (const file of files) {
    for (const text of fileCopy(file)) {
      const phrase = normalizeCopy(text);
      if (isCopy(phrase)) phrases.add(phrase);
    }
  }
  return [...phrases];
}

/**
 * @name renderSettingsSearchCopy
 * @description Extracts the visible copy (JSX text and label, detail and
 * description strings) from every settings section's source and renders the
 * committed module the settings search matches against.
 *
 * @example
 * const [path, contents] = renderSettingsSearchCopy();
 * writeFileSync(path, contents);
 */
export function renderSettingsSearchCopy(): [string, string] {
  const entries = sectionSources()
    .map(([section, files]) => {
      const lines = sectionCopy(files).map((phrase) => `    ${JSON.stringify(phrase)},`);
      return [`  ${section}: [`, ...lines, "  ],"].join("\n");
    })
    .join("\n");
  const contents = [
    "// Generated by apps/workspace/scripts/settings-search/generate.ts. Do not edit.",
    'import type { SectionId } from "./sections";',
    "",
    "export const SETTINGS_SEARCH_COPY = {",
    entries,
    "} as const satisfies Record<SectionId, readonly string[]>;",
    "",
  ].join("\n");
  return [SETTINGS_SEARCH_COPY_PATH, contents];
}
