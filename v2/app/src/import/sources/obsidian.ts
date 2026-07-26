import type { MarkdownTree } from "../../export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportedNoteProperty,
  ImportedPropertyValue,
  ImportWarning,
} from "../model";
import { noteTitleFromPath, relativeLinkBetween } from "../model";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const EMBED_PATTERN = /!\[\[([^\][\n]+)\]\]/g;
const EMBED_SIGNAL_PATTERN = /!\[\[[^\][\n]+\]\]/;
const WIKILINK_PATTERN = /(^|[^!])\[\[[^\][\n]+\]\]/;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp)$/i;
const EMBED_SIZE_PATTERN = /^\d+(x\d+)?$/;
const MAX_PROPERTIES_PER_NOTE = 64;
const MAX_PROPERTY_NAME_BYTES = 80;
const MAX_PROPERTY_VALUE_BYTES = 2_000;

type ParsedFrontmatter = {
  properties: ImportedNoteProperty[];
  tags: string[];
  complexKeys: number;
};

type AssetIndex = {
  byPath: Map<string, string>;
  byBaseName: Map<string, string>;
};

function isMarkdownFile(relativePath: string): boolean {
  return /\.(md|markdown)$/i.test(relativePath);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(raw: string): ImportedPropertyValue {
  const trimmed = raw.trim();
  if (trimmed !== unquote(trimmed)) {
    return { type: "text", value: unquote(trimmed) };
  }
  if (trimmed === "true" || trimmed === "false") {
    return { type: "checkbox", value: trimmed === "true" };
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { type: "number", value: Number(trimmed) };
  }
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(trimmed)) {
    return { type: "date", value: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", value: trimmed };
  }
  return { type: "text", value: trimmed };
}

function parseInlineList(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) {
    return [];
  }
  return inner.split(",").map(unquote).filter((item) => item.length > 0);
}

function splitTags(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(/[,\s]+/))
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter((tag) => tag.length > 0);
}

function propertyValueByteLength(value: ImportedPropertyValue): number {
  if (value.type === "list") {
    return value.values.reduce((total, item) => total + byteLength(item), 0);
  }
  if (value.type === "text" || value.type === "date" || value.type === "url") {
    return byteLength(value.value);
  }
  return 0;
}

function parseFrontmatterBlock(block: string): ParsedFrontmatter {
  const lines = block.split(/\r?\n/);
  const properties: ImportedNoteProperty[] = [];
  const tags: string[] = [];
  let complexKeys = 0;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    index += 1;
    if (line.trim().length === 0) {
      continue;
    }
    const match = /^([^\s:][^:]*):\s*(.*)$/.exec(line);
    if (!match) {
      complexKeys += 1;
      continue;
    }
    const name = match[1]?.trim() ?? "";
    const inline = match[2] ?? "";
    let value: ImportedPropertyValue | null = null;
    if (inline.trim().length > 0) {
      const list = parseInlineList(inline);
      value = list === null ? parseScalar(inline) : { type: "list", values: list };
    } else {
      const items: string[] = [];
      let nested = false;
      while (index < lines.length) {
        const next = lines[index] ?? "";
        const itemMatch = /^\s*-\s*(.*)$/.exec(next);
        if (itemMatch) {
          items.push(unquote(itemMatch[1] ?? ""));
          index += 1;
          continue;
        }
        if (/^\s+\S/.test(next)) {
          nested = true;
          index += 1;
          continue;
        }
        break;
      }
      if (nested) {
        complexKeys += 1;
        continue;
      }
      if (items.length > 0) {
        value = { type: "list", values: items.filter((item) => item.length > 0) };
      }
    }
    if (value === null) {
      continue;
    }
    if (name === "tags" || name === "tag") {
      tags.push(...splitTags(value.type === "list" ? value.values : [String(value.value)]));
      continue;
    }
    if (
      byteLength(name) > MAX_PROPERTY_NAME_BYTES ||
      propertyValueByteLength(value) > MAX_PROPERTY_VALUE_BYTES
    ) {
      complexKeys += 1;
      continue;
    }
    properties.push({ name, value });
  }
  if (properties.length > MAX_PROPERTIES_PER_NOTE) {
    complexKeys += properties.length - MAX_PROPERTIES_PER_NOTE;
    properties.length = MAX_PROPERTIES_PER_NOTE;
  }
  return { properties, tags, complexKeys };
}

function buildAssetIndex(tree: MarkdownTree): AssetIndex {
  const byPath = new Map<string, string>();
  const byBaseName = new Map<string, string>();
  for (const asset of tree.assets ?? []) {
    const lowered = asset.toLowerCase();
    if (!byPath.has(lowered)) {
      byPath.set(lowered, asset);
    }
    const cut = lowered.lastIndexOf("/");
    const baseName = cut === -1 ? lowered : lowered.slice(cut + 1);
    if (!byBaseName.has(baseName)) {
      byBaseName.set(baseName, asset);
    }
  }
  return { byPath, byBaseName };
}

function findAsset(index: AssetIndex, target: string): string | null {
  const lowered = target.toLowerCase().replace(/^\.\//, "");
  const byPath = index.byPath.get(lowered);
  if (byPath !== undefined) {
    return byPath;
  }
  const cut = lowered.lastIndexOf("/");
  return index.byBaseName.get(cut === -1 ? lowered : lowered.slice(cut + 1)) ?? null;
}

type EmbedConversion = {
  markdown: string;
  unresolvedImages: number;
  noteEmbeds: number;
};

function convertEmbeds(
  markdown: string,
  notePath: string,
  assets: AssetIndex,
): EmbedConversion {
  let unresolvedImages = 0;
  let noteEmbeds = 0;
  const converted = markdown.replace(EMBED_PATTERN, (whole, inner: string) => {
    const [rawTarget = "", ...labelParts] = inner.split("|");
    const target = rawTarget.trim();
    if (!IMAGE_EXTENSION_PATTERN.test(target)) {
      noteEmbeds += 1;
      return `[[${target}]]`;
    }
    const asset = findAsset(assets, target);
    if (asset === null) {
      unresolvedImages += 1;
      return whole;
    }
    const label = labelParts.join("|").trim();
    const baseName = target.slice(target.lastIndexOf("/") + 1);
    const alt = label.length > 0 && !EMBED_SIZE_PATTERN.test(label) ? label : baseName;
    return `![${alt}](${relativeLinkBetween(notePath, asset)})`;
  });
  return { markdown: converted, unresolvedImages, noteEmbeds };
}

function count(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? "" : "s"}`;
}

function parse(tree: MarkdownTree): ImportBundle {
  const assets = buildAssetIndex(tree);
  const notes: ImportedNote[] = [];
  const warnings: ImportWarning[] = [];
  let complexKeys = 0;
  let unresolvedImages = 0;
  let noteEmbeds = 0;
  for (const file of tree.files) {
    if (!isMarkdownFile(file.relativePath)) {
      continue;
    }
    let markdown = file.content;
    let frontmatter: ParsedFrontmatter | null = null;
    const originalMarkdown = markdown;
    const block = FRONTMATTER_PATTERN.exec(markdown);
    if (block) {
      markdown = markdown.slice(block[0].length);
      frontmatter = parseFrontmatterBlock(block[1] ?? "");
      complexKeys += frontmatter.complexKeys;
    }
    const preserveFrontmatter = (frontmatter?.complexKeys ?? 0) > 0;
    const conversion = preserveFrontmatter
      ? {
          markdown: originalMarkdown,
          unresolvedImages: 0,
          noteEmbeds: 0,
        }
      : convertEmbeds(markdown, file.relativePath, assets);
    unresolvedImages += conversion.unresolvedImages;
    noteEmbeds += conversion.noteEmbeds;
    notes.push({
      relativePath: file.relativePath,
      title: noteTitleFromPath(file.relativePath),
      markdown: conversion.markdown,
      ...(frontmatter && frontmatter.tags.length > 0 ? { tags: frontmatter.tags } : {}),
      ...(frontmatter && frontmatter.properties.length > 0
        ? { properties: frontmatter.properties }
        : {}),
    });
  }
  const notePaths = notes.map((note) => note.relativePath);
  const directories = tree.directories.filter((directory) =>
    notePaths.some((path) => path.startsWith(`${directory}/`)),
  );
  if (complexKeys > 0) {
    warnings.push({
      message: `Skipped ${count(complexKeys, "frontmatter field")} too complex to import as properties`,
    });
  }
  if (unresolvedImages > 0) {
    warnings.push({
      message: `${count(unresolvedImages, "image embed")} matched no file in the vault and stayed as text`,
    });
  }
  if (noteEmbeds > 0) {
    warnings.push({
      message: `Converted ${count(noteEmbeds, "note embed")} to plain links`,
    });
  }
  return {
    sourceId: obsidianSource.id,
    sourceLabel: obsidianSource.label,
    directories,
    notes,
    warnings,
  };
}

export const obsidianSource: ImportSourceAdapter = {
  id: "obsidian",
  label: "Obsidian",
  detect(tree) {
    const markdownFiles = tree.files.filter((file) => isMarkdownFile(file.relativePath));
    if (markdownFiles.length === 0) {
      return 0;
    }
    const signals = markdownFiles.filter(
      (file) =>
        FRONTMATTER_PATTERN.test(file.content) ||
        EMBED_SIGNAL_PATTERN.test(file.content) ||
        WIKILINK_PATTERN.test(file.content),
    ).length;
    return signals / markdownFiles.length >= 0.3 ? 0.8 : 0;
  },
  parse,
};
