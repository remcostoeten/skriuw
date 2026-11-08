import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";
import { settingsCopy } from "../../src/shared/ui/settings-copy";

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

const SECTION_ROOTS: Record<string, string> = {
  appearance: "AppearanceSection",
  editor: "EditorSection",
  ai: "AiSection",
  shortcuts: "ShortcutsSection",
  media: "MediaSection",
  account: "AccountSection",
  lock: "LockSection",
  data: "DataSection",
  about: "AboutSection",
};

const ROW_COMPONENTS = new Set(["SettingsRow", "SettingToggle", "SettingSegmented"]);

type IndexRow = { label: string; detail: string };

type IndexGroup = {
  id: string;
  title: string;
  hint: string;
  keywords: string;
  rows: IndexRow[];
};

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

function parseFile(path: string): AstNode {
  const result = parseSync(path, readFileSync(path, "utf8"));
  if (result.errors.length > 0) {
    throw new Error(`Cannot parse ${path}: ${result.errors[0]?.message}`);
  }
  return result.program;
}

function fileCopy(path: string): string[] {
  const copy: string[] = [];
  collectCopy(parseFile(path), copy);
  return copy;
}

function identifierName(node: unknown): string | undefined {
  return isNode(node) && node.type === "Identifier" && typeof node.name === "string"
    ? node.name
    : undefined;
}

function copyEntry(section: string, key: string): string | undefined {
  const entries = Object.entries(settingsCopy).find(([name]) => name === section)?.[1];
  const value = entries ? Object.entries(entries).find(([name]) => name === key)?.[1] : undefined;
  return typeof value === "string" ? value : undefined;
}

function settingsCopyText(node: AstNode): string | undefined {
  if (node.type !== "MemberExpression" || !isNode(node.object)) {
    return undefined;
  }
  const inner = node.object;
  if (inner.type !== "MemberExpression" || identifierName(inner.object) !== "settingsCopy") {
    return undefined;
  }
  const section = identifierName(inner.property);
  const key = identifierName(node.property);
  return section && key ? copyEntry(section, key) : undefined;
}

function nodeText(node: unknown, strict: boolean): string | undefined {
  if (!isNode(node)) {
    return undefined;
  }
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? node.value : undefined;
    case "JSXText":
      return typeof node.value === "string" ? node.value : undefined;
    case "TemplateLiteral": {
      const expressions = Array.isArray(node.expressions) ? node.expressions : [];
      if (strict && expressions.length > 0) return undefined;
      return staticText(node).join("");
    }
    case "JSXExpressionContainer":
      return nodeText(node.expression, strict);
    case "MemberExpression":
      return settingsCopyText(node);
    case "ConditionalExpression":
      return strict
        ? undefined
        : [nodeText(node.consequent, false), nodeText(node.alternate, false)]
            .filter((text) => text !== undefined)
            .join(" ");
    case "LogicalExpression":
      return strict ? undefined : nodeText(node.right, false);
    case "JSXFragment":
    case "JSXElement": {
      if (strict || !Array.isArray(node.children)) return undefined;
      return node.children.map((child) => nodeText(child, false) ?? "").join("");
    }
    default:
      return undefined;
  }
}

function elementName(node: AstNode): string | undefined {
  const opening = node.openingElement;
  if (!isNode(opening) || !isNode(opening.name)) {
    return undefined;
  }
  return opening.name.type === "JSXIdentifier" && typeof opening.name.name === "string"
    ? opening.name.name
    : undefined;
}

function elementAttribute(node: AstNode, name: string): unknown {
  const opening = node.openingElement;
  if (!isNode(opening) || !Array.isArray(opening.attributes)) {
    return undefined;
  }
  const attribute = opening.attributes.find(
    (candidate) => isNode(candidate) && attributeName(candidate) === name,
  );
  return isNode(attribute) ? attribute.value : undefined;
}

function titleText(value: unknown): string | undefined {
  if (isNode(value) && value.type === "JSXExpressionContainer" && isNode(value.expression)) {
    if (value.expression.type === "ConditionalExpression") {
      return nodeText(value.expression.alternate, false);
    }
  }
  return nodeText(value, false);
}

function indexText(value: unknown, strict: boolean): string {
  return normalizeCopy(nodeText(value, strict) ?? "");
}

function readGroup(node: AstNode): IndexGroup | null {
  const id = nodeText(elementAttribute(node, "id"), true);
  if (!id) {
    return null;
  }
  return {
    id,
    title: normalizeCopy(titleText(elementAttribute(node, "title")) ?? ""),
    hint: indexText(elementAttribute(node, "hint"), false),
    keywords: indexText(elementAttribute(node, "keywords"), true),
    rows: [],
  };
}

function readRow(node: AstNode): IndexRow | null {
  const label = indexText(elementAttribute(node, "label"), true);
  if (!label) {
    return null;
  }
  return { label, detail: indexText(elementAttribute(node, "detail"), false) };
}

type ComponentMap = ReadonlyMap<string, AstNode>;

function componentDefinitions(programs: readonly AstNode[]): ComponentMap {
  const components = new Map<string, AstNode>();
  for (const program of programs) {
    const body = Array.isArray(program.body) ? program.body : [];
    for (const statement of body) {
      const declaration =
        isNode(statement) && statement.type === "ExportNamedDeclaration"
          ? statement.declaration
          : statement;
      if (isNode(declaration) && declaration.type === "FunctionDeclaration") {
        const name = identifierName(declaration.id);
        if (name && isNode(declaration.body)) components.set(name, declaration.body);
      }
    }
  }
  return components;
}

type GroupWalk = {
  components: ComponentMap;
  visiting: Set<string>;
  groups: IndexGroup[];
};

function walkGroups(node: unknown, walk: GroupWalk, current: IndexGroup | null): void {
  if (Array.isArray(node)) {
    for (const child of node) walkGroups(child, walk, current);
    return;
  }
  if (!isNode(node)) {
    return;
  }
  if (node.type === "JSXElement") {
    const name = elementName(node);
    if (name === "SettingsGroup") {
      const group = readGroup(node);
      if (group) walk.groups.push(group);
      walkGroups(node.children, walk, group);
      return;
    }
    if (name && ROW_COMPONENTS.has(name)) {
      const row = current ? readRow(node) : null;
      if (current && row && !current.rows.some((existing) => existing.label === row.label)) {
        current.rows.push(row);
      }
      return;
    }
    const component = name ? walk.components.get(name) : undefined;
    if (name && component && !walk.visiting.has(name)) {
      walk.visiting.add(name);
      walkGroups(component, walk, current);
      walk.visiting.delete(name);
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "type" && value !== null && typeof value === "object") {
      walkGroups(value, walk, current);
    }
  }
}

function sectionGroups(section: string, files: readonly string[]): IndexGroup[] {
  const components = componentDefinitions(files.map(parseFile));
  const root = components.get(SECTION_ROOTS[section] ?? "");
  if (!root) {
    throw new Error(`No ${SECTION_ROOTS[section]} component found for the ${section} section`);
  }
  const walk: GroupWalk = { components, visiting: new Set(), groups: [] };
  walkGroups(root, walk, null);
  return walk.groups;
}

function renderGroups(groups: readonly IndexGroup[]): string[] {
  return groups.flatMap((group) => [
    "    {",
    `      id: ${JSON.stringify(group.id)},`,
    `      title: ${JSON.stringify(group.title)},`,
    `      hint: ${JSON.stringify(group.hint)},`,
    `      keywords: ${JSON.stringify(group.keywords)},`,
    "      rows: [",
    ...group.rows.map(
      (row) =>
        `        { label: ${JSON.stringify(row.label)}, detail: ${JSON.stringify(row.detail)} },`,
    ),
    "      ],",
    "    },",
  ]);
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
 * description strings) from every settings section's source, plus each
 * section's groups and rows in render order, and renders the committed module
 * the settings search matches against.
 *
 * @example
 * const [path, contents] = renderSettingsSearchCopy();
 * writeFileSync(path, contents);
 */
export function renderSettingsSearchCopy(): [string, string] {
  const sources = sectionSources();
  const entries = sources
    .map(([section, files]) => {
      const lines = sectionCopy(files).map((phrase) => `    ${JSON.stringify(phrase)},`);
      return [`  ${section}: [`, ...lines, "  ],"].join("\n");
    })
    .join("\n");
  const groups = sources
    .map(([section, files]) =>
      [`  ${section}: [`, ...renderGroups(sectionGroups(section, files)), "  ],"].join("\n"),
    )
    .join("\n");
  const contents = [
    "// Generated by apps/workspace/scripts/settings-search/generate.ts. Do not edit.",
    'import type { SettingsSearchGroup } from "./navigation";',
    'import type { SectionId } from "./sections";',
    "",
    "export const SETTINGS_SEARCH_COPY = {",
    entries,
    "} as const satisfies Record<SectionId, readonly string[]>;",
    "",
    "export const SETTINGS_SEARCH_GROUPS = {",
    groups,
    "} as const satisfies Record<SectionId, readonly SettingsSearchGroup[]>;",
    "",
  ].join("\n");
  return [SETTINGS_SEARCH_COPY_PATH, contents];
}
